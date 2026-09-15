use crate::{
    report::{Query, ReportEnvelope, validate_report},
    settings::Settings,
    storage::{recover_invalid, recover_json, save_json},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    future::Future,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct HistorySample {
    pub(crate) at: u64,
    pub(crate) source: String,
    pub(crate) used_percent: f64,
}

pub(crate) struct AppState {
    pub(crate) directory: PathBuf,
    settings: Mutex<Settings>,
    cache: Mutex<BTreeMap<String, ReportEnvelope>>,
    history: Mutex<Vec<HistorySample>>,
    settings_writable: bool,
    cache_writable: bool,
    history_writable: bool,
    startup_notice: Option<String>,
    pub(crate) gate: tokio::sync::Mutex<()>,
    pub(crate) wake: tokio::sync::Notify,
}

fn lock<T>(mutex: &Mutex<T>) -> Result<MutexGuard<'_, T>, String> {
    mutex
        .lock()
        .map_err(|_| "L’état local est indisponible. Redémarrez l’application.".into())
}

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

impl AppState {
    pub(crate) fn new(directory: PathBuf) -> Result<Self, String> {
        std::fs::create_dir_all(&directory)
            .map_err(|_| "Le dossier des données locales est inaccessible.".to_owned())?;
        let mut settings = recover_json::<Settings>(&directory.join("settings.json"));
        match settings.value.clone().validate() {
            Ok(validated) => settings.value = validated,
            Err(_) => settings = recover_invalid(&directory.join("settings.json")),
        }
        let cache = recover_json(&directory.join("reports.json"));
        let history = recover_json(&directory.join("history.json"));
        let startup_notice = settings
            .notice
            .clone()
            .or(cache.notice.clone())
            .or(history.notice.clone());
        Ok(Self {
            directory,
            settings_writable: settings.writable,
            cache_writable: cache.writable,
            history_writable: history.writable,
            settings: Mutex::new(settings.value),
            cache: Mutex::new(cache.value),
            history: Mutex::new(history.value),
            startup_notice,
            gate: tokio::sync::Mutex::new(()),
            wake: tokio::sync::Notify::new(),
        })
    }

    pub(crate) fn settings(&self) -> Result<Settings, String> {
        Ok(lock(&self.settings)?.clone())
    }
    pub(crate) fn history(&self) -> Result<Vec<HistorySample>, String> {
        Ok(lock(&self.history)?.clone())
    }

    pub(crate) fn cached_report(&self, query: &Query) -> Result<Option<ReportEnvelope>, String> {
        let settings = self.settings()?;
        let cached = lock(&self.cache)?.get(&query.cache_key(&settings)).cloned();
        cached
            .map(|report| {
                validate_report(query, &report.report)?;
                Ok(self.with_notice(ReportEnvelope {
                    cached: true,
                    ..report
                }))
            })
            .transpose()
    }

    pub(crate) fn record_quota(&self, sample: HistorySample) -> Result<(), String> {
        let mut history = lock(&self.history)?;
        if history
            .iter()
            .rev()
            .find(|previous| previous.source == sample.source)
            .is_some_and(|previous| previous.at >= sample.at)
        {
            return Ok(());
        }
        history.push(sample);
        if !self.history_writable {
            return Err("L’historique illisible est protégé en écriture.".into());
        }
        save_json(&self.directory.join("history.json"), &*history)
    }

    pub(crate) async fn collect_quota_with<F, Fut>(
        &self,
        collect: F,
    ) -> Result<(String, Option<HistorySample>), String>
    where
        F: FnOnce(Settings) -> Fut,
        Fut: Future<Output = Result<Option<HistorySample>, String>>,
    {
        let _gate = self.gate.lock().await;
        let settings = self.settings()?;
        let source = settings.quota_source.clone();
        if settings.offline {
            return Ok((source, None));
        }
        let snapshot = collect(settings).await?;
        if let Some(sample) = &snapshot {
            self.record_quota(sample.clone())?;
        }
        Ok((source, snapshot))
    }

    // Callers hold gate when changing settings so in-flight reports keep their configuration.
    pub(crate) fn persist_settings(&self, settings: Settings) -> Result<Settings, String> {
        if !self.settings_writable {
            return Err("Les réglages illisibles sont protégés. Vérifiez les fichiers locaux avant de réessayer.".into());
        }
        let settings = settings.validate()?;
        save_json(&self.directory.join("settings.json"), &settings)?;
        *lock(&self.settings)? = settings.clone();
        self.wake.notify_one();
        Ok(settings)
    }

    pub(crate) fn save_with_startup(
        &self,
        settings: Settings,
        currently_enabled: bool,
        mut set_startup: impl FnMut(bool) -> Result<(), String>,
    ) -> Result<Settings, String> {
        let settings = settings.validate()?;
        let changed = currently_enabled != settings.launch_at_login;
        if changed {
            set_startup(settings.launch_at_login)?;
        }
        match self.persist_settings(settings) {
            Ok(settings) => Ok(settings),
            Err(error) => {
                if changed && set_startup(currently_enabled).is_err() {
                    return Err(format!(
                        "{error} Le démarrage automatique doit aussi être vérifié dans les paramètres Windows."
                    ));
                }
                Err(error)
            }
        }
    }

    pub(crate) async fn load_with<F, Fut>(
        &self,
        query: Query,
        force: bool,
        collect: F,
    ) -> Result<ReportEnvelope, String>
    where
        F: FnOnce(Settings) -> Fut,
        Fut: Future<Output = Result<Value, String>>,
    {
        let started = now_ms();
        if !force {
            let settings = self.settings()?;
            let cached = lock(&self.cache)?.get(&query.cache_key(&settings)).cloned();
            if let Some(report) = cached
                && report.is_fresh(started, u64::from(settings.refresh_minutes) * 60_000)
            {
                return Ok(self.with_notice(ReportEnvelope {
                    cached: true,
                    ..report
                }));
            }
        }
        let _gate = self.gate.lock().await;
        let settings = self.settings()?;
        let key = query.cache_key(&settings);
        let cached = lock(&self.cache)?.get(&key).cloned();
        if let Some(report) = cached.as_ref()
            && report.is_fresh(now_ms(), u64::from(settings.refresh_minutes) * 60_000)
            && (!force || report.updated_at > started)
        {
            return Ok(self.with_notice(ReportEnvelope {
                cached: true,
                ..report.clone()
            }));
        }
        let output = collect(settings.clone()).await.and_then(|report| {
            validate_report(&query, &report)?;
            Ok(report)
        });
        match output {
            Err(error) => cached
                .map(|report| self.with_notice(report.fallback(error.clone())))
                .ok_or_else(|| match &self.startup_notice {
                    Some(notice) => format!("{error} {notice}"),
                    None => error,
                }),
            Ok(report) => {
                let mut envelope = ReportEnvelope::fresh(report, now_ms());
                let mut warnings = Vec::new();
                let mut cache = lock(&self.cache)?;
                cache.insert(key, envelope.clone());
                if self.cache_writable
                    && let Err(error) = save_json(&self.directory.join("reports.json"), &*cache)
                {
                    warnings.push(error);
                }
                if !warnings.is_empty() {
                    envelope.error = Some(format!(
                        "Relevé actualisé, mais la sauvegarde locale a échoué. {}",
                        warnings.join(" ")
                    ));
                }
                Ok(self.with_notice(envelope))
            }
        }
    }

    fn with_notice(&self, mut envelope: ReportEnvelope) -> ReportEnvelope {
        if let Some(notice) = &self.startup_notice {
            envelope.error = Some(match envelope.error {
                Some(error) => format!("{error} {notice}"),
                None => notice.clone(),
            });
        }
        envelope
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn recorded_report_can_be_read_while_stale_and_another_collection_is_busy() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let query = Query::new("month", "summary").unwrap();
        let original = ReportEnvelope::fresh(json!({"totals":{},"agents":[],"models":[]}), 1);
        lock(&state.cache)
            .unwrap()
            .insert(query.cache_key(&state.settings().unwrap()), original);
        let _busy = state.gate.lock().await;

        let cached = state.cached_report(&query).unwrap().unwrap();
        assert!(cached.cached);
        assert_eq!(cached.updated_at, 1);
    }

    #[test]
    fn recorded_report_is_not_reused_after_changing_source_folders() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let query = Query::new("month", "summary").unwrap();
        lock(&state.cache).unwrap().insert(
            query.cache_key(&state.settings().unwrap()),
            ReportEnvelope::fresh(json!({"totals":{},"agents":[],"models":[]}), 1),
        );
        state
            .persist_settings(Settings {
                codex_homes: dir.path().to_string_lossy().into_owned(),
                ..Settings::default()
            })
            .unwrap();

        assert!(state.cached_report(&query).unwrap().is_none());
    }

    #[tokio::test]
    async fn fresh_report_is_available_while_collection_gate_is_busy() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let query = Query::new("month", "summary").unwrap();
        let first = state
            .load_with(query.clone(), false, |_| async {
                Ok(json!({"totals":{},"agents":[],"models":[]}))
            })
            .await
            .unwrap();
        let _busy = state.gate.lock().await;

        let cached = tokio::time::timeout(
            std::time::Duration::from_millis(100),
            state.load_with(query, false, |_| async {
                panic!("a fresh report must not invoke the engine")
            }),
        )
        .await
        .expect("cached reports must not wait for an unrelated collection")
        .unwrap();
        assert!(cached.cached);
        assert_eq!(cached.updated_at, first.updated_at);
    }

    #[tokio::test]
    async fn queued_collection_uses_settings_saved_before_it_acquires_the_gate() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let gate = state.gate.lock().await;
        let (result, ()) = tokio::join!(
            state.collect_quota_with(|_| async {
                panic!("offline setting must prevent network collection")
            }),
            async {
                state
                    .persist_settings(Settings {
                        offline: true,
                        quota_source: "claude".into(),
                        ..Settings::default()
                    })
                    .unwrap();
                drop(gate);
            }
        );
        let (source, sample) = result.unwrap();
        assert_eq!(source, "claude");
        assert!(sample.is_none());
    }

    #[test]
    fn invalid_settings_values_also_preserve_originals_with_a_notice() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), r#"{"refreshMinutes":0}"#).unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        assert_eq!(state.settings().unwrap().refresh_minutes, 5);
        assert!(state.startup_notice.is_some());
        assert!(dir.path().join("recovery").is_dir());
    }

    #[tokio::test]
    async fn a_harness_report_never_creates_a_live_history_sample() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        state.load_with(Query::new("all", "codex").unwrap(), false, |_| async {
            Ok(json!({"agent":"codex","daily":[],"liveLimits":true,"window":{"usedPercent":24.0}}))
        }).await.unwrap();
        assert!(state.history().unwrap().is_empty());
    }

    #[tokio::test]
    async fn corrupted_optional_archives_do_not_prevent_startup_or_destroy_originals() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("reports.json"), "broken cache").unwrap();
        std::fs::write(dir.path().join("history.json"), "broken history").unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        assert!(state.history().unwrap().is_empty());
        let report = state
            .load_with(Query::new("all", "summary").unwrap(), false, |_| async {
                Ok(json!({"totals":{},"agents":[],"models":[]}))
            })
            .await
            .unwrap();
        assert!(report.error.as_ref().unwrap().contains("recovery"));
        let originals: Vec<String> = std::fs::read_dir(dir.path().join("recovery"))
            .unwrap()
            .map(|entry| std::fs::read_to_string(entry.unwrap().path()).unwrap())
            .collect();
        assert!(originals.contains(&"broken cache".to_owned()));
        assert!(originals.contains(&"broken history".to_owned()));
    }

    #[test]
    fn corrupted_settings_open_with_safe_defaults_and_preserve_original() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("settings.json"), "broken settings").unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        assert_eq!(state.settings().unwrap(), Settings::default());
        state
            .persist_settings(Settings {
                theme: "dark".into(),
                ..Settings::default()
            })
            .unwrap();
        let original = std::fs::read_dir(dir.path().join("recovery"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(original.path()).unwrap(),
            "broken settings"
        );
    }

    #[test]
    fn failed_settings_save_rolls_back_only_an_explicit_startup_change() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        std::fs::create_dir(dir.path().join("settings.json")).unwrap();
        let mut changes = Vec::new();
        let result = state.save_with_startup(
            Settings {
                launch_at_login: true,
                ..Settings::default()
            },
            false,
            |enabled| {
                changes.push(enabled);
                Ok(())
            },
        );
        assert!(result.is_err());
        assert_eq!(changes, [true, false]);
        assert!(!state.settings().unwrap().launch_at_login);
    }

    #[test]
    fn saving_other_preferences_does_not_touch_the_startup_registration() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        state
            .save_with_startup(
                Settings {
                    theme: "dark".into(),
                    ..Settings::default()
                },
                false,
                |_| panic!("startup preference is unchanged"),
            )
            .unwrap();
        assert_eq!(state.settings().unwrap().theme, "dark");
    }

    #[tokio::test]
    async fn cached_reports_do_not_execute_again_and_survive_restart() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let query = Query::new("all", "summary").unwrap();
        let first = state
            .load_with(query.clone(), false, |_| async {
                Ok(json!({"totals":{},"agents":[],"models":[]}))
            })
            .await
            .unwrap();
        let second = state
            .load_with(query.clone(), false, |_| async {
                panic!("fresh cache must avoid collection")
            })
            .await
            .unwrap();
        assert!(second.cached);
        assert_eq!(second.updated_at, first.updated_at);
        let restored = AppState::new(dir.path().to_owned()).unwrap();
        assert_eq!(
            restored
                .load_with(query, false, |_| async {
                    panic!("persisted fresh report must be reused")
                })
                .await
                .unwrap()
                .updated_at,
            first.updated_at
        );
    }

    #[tokio::test]
    async fn failure_returns_stale_report_without_adding_history() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let query = Query::new("all", "codex").unwrap();
        let live = crate::quota::parse_snapshot("codex", &json!({"agent":"codex","observedAt":1_000_000,"window":{"windowMinutes":10080,"usedPercent":24.0,"elapsedPercent":30.0}}), 1_010_000).unwrap().unwrap();
        state.record_quota(live).unwrap();
        let first = state.load_with(query.clone(), false, |_| async { Ok(json!({"agent":"codex","daily":[],"liveLimits":true,"window":{"usedPercent":24.0}})) }).await.unwrap();
        let fallback = state
            .load_with(query, true, |_| async {
                Err("Connexion indisponible".into())
            })
            .await
            .unwrap();
        assert_eq!(fallback.updated_at, first.updated_at);
        assert!(fallback.cached);
        assert_eq!(fallback.error.as_deref(), Some("Connexion indisponible"));
        assert_eq!(state.history().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn settings_change_invalidates_previous_source_cache() {
        let dir = tempfile::tempdir().unwrap();
        let state = AppState::new(dir.path().to_owned()).unwrap();
        let query = Query::new("all", "summary").unwrap();
        state
            .load_with(query.clone(), false, |_| async {
                Ok(json!({"totals":{},"agents":[],"models":[]}))
            })
            .await
            .unwrap();
        state
            .persist_settings(Settings {
                offline: true,
                ..Settings::default()
            })
            .unwrap();
        let result = state
            .load_with(query, false, |settings| async move {
                assert!(settings.offline);
                Err("New configuration has no data".into())
            })
            .await;
        assert!(result.is_err());
    }
}
