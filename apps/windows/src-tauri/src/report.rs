use crate::settings::Settings;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Query {
    pub(crate) period: String,
    pub(crate) source: String,
}

impl Query {
    pub(crate) fn new(period: &str, source: &str) -> Result<Self, String> {
        if !matches!(
            period,
            "all" | "today" | "yesterday" | "week" | "month" | "wtd" | "mtd" | "ytd"
        ) || !matches!(source, "summary" | "codex" | "claude" | "cursor")
        {
            return Err("La période ou la source demandée est invalide.".into());
        }
        Ok(Self {
            period: if matches!(source, "codex" | "claude") {
                "all"
            } else {
                period
            }
            .into(),
            source: source.into(),
        })
    }

    pub(crate) fn arguments(&self, offline: bool) -> Vec<String> {
        let mut args: Vec<String> = if matches!(self.source.as_str(), "codex" | "claude") {
            vec!["harness".into(), self.source.clone()]
        } else {
            let mut args = vec!["summary".into()];
            if self.period != "all" {
                args.push(self.period.clone());
            }
            if self.source == "cursor" {
                args.extend(["--agents".into(), "cursor".into()]);
            }
            args
        };
        args.extend(["--value".into(), "--json".into(), "--no-color".into()]);
        if offline {
            args.push("--offline".into());
        }
        args
    }

    pub(crate) fn cache_key(&self, settings: &Settings) -> String {
        json!([
            self.source,
            self.period,
            settings.offline,
            settings.codex_homes,
            settings.claude_config_dir,
            settings.cursor_data_dir
        ])
        .to_string()
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReportEnvelope {
    pub(crate) report: Value,
    pub(crate) updated_at: u64,
    pub(crate) cached: bool,
    pub(crate) error: Option<String>,
}

impl ReportEnvelope {
    pub(crate) fn fresh(report: Value, updated_at: u64) -> Self {
        Self {
            report,
            updated_at,
            cached: false,
            error: None,
        }
    }

    pub(crate) fn is_fresh(&self, now: u64, lifetime_ms: u64) -> bool {
        self.error.is_none() && now >= self.updated_at && now - self.updated_at < lifetime_ms
    }

    pub(crate) fn fallback(&self, error: String) -> Self {
        Self {
            cached: true,
            error: Some(error),
            ..self.clone()
        }
    }
}

pub(crate) fn validate_report(query: &Query, report: &Value) -> Result<(), String> {
    let valid = if matches!(query.source.as_str(), "codex" | "claude") {
        report["agent"].as_str() == Some(query.source.as_str()) && report["daily"].is_array()
    } else {
        report["totals"].is_object() && report["agents"].is_array() && report["models"].is_array()
    };
    if valid {
        Ok(())
    } else {
        Err("Le moteur a renvoyé un rapport non reconnu.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn builds_only_whitelisted_summary_arguments() {
        let query = Query::new("week", "cursor").unwrap();
        assert_eq!(
            query.arguments(false),
            [
                "summary",
                "week",
                "--agents",
                "cursor",
                "--value",
                "--json",
                "--no-color"
            ]
        );
        assert!(Query::new("--help", "summary").is_err());
        assert!(Query::new("all", "powershell").is_err());
    }

    #[test]
    fn harness_uses_current_window_and_supports_offline() {
        let query = Query::new("today", "codex").unwrap();
        assert_eq!(
            query.arguments(true),
            [
                "harness",
                "codex",
                "--value",
                "--json",
                "--no-color",
                "--offline"
            ]
        );
        assert_eq!(query, Query::new("month", "codex").unwrap());
    }

    #[test]
    fn cache_key_changes_with_data_configuration_but_not_theme() {
        let query = Query::new("all", "summary").unwrap();
        let settings = crate::settings::Settings::default();
        assert_ne!(
            query.cache_key(&settings),
            query.cache_key(&crate::settings::Settings {
                offline: true,
                ..settings.clone()
            })
        );
        assert_eq!(
            query.cache_key(&settings),
            query.cache_key(&crate::settings::Settings {
                theme: "dark".into(),
                ..settings
            })
        );
    }

    #[test]
    fn stale_fallback_preserves_original_timestamp_and_explains_failure() {
        let original = ReportEnvelope::fresh(json!({"totals": {}}), 1000);
        let stale = original.fallback("Délai dépassé".into());
        assert_eq!(stale.updated_at, 1000);
        assert!(stale.cached);
        assert_eq!(stale.error.as_deref(), Some("Délai dépassé"));
        assert!(!original.is_fresh(400_000, 300_000));
    }

    #[test]
    fn rejects_unrecognized_engine_reports() {
        assert!(
            validate_report(
                &Query::new("all", "summary").unwrap(),
                &json!({"error":"bad"})
            )
            .is_err()
        );
        assert!(
            validate_report(
                &Query::new("all", "codex").unwrap(),
                &json!({"agent":"claude","daily":[]})
            )
            .is_err()
        );
        assert!(
            validate_report(
                &Query::new("all", "summary").unwrap(),
                &json!({"totals":{},"agents":[],"models":[]})
            )
            .is_ok()
        );
    }
}
