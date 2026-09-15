use crate::{
    engine,
    report::{Query, ReportEnvelope},
    service::{AppState, HistorySample},
    settings::Settings,
};
use std::{path::PathBuf, sync::Arc, time::Duration};
use tauri::{
    Emitter, Manager,
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_autostart::ManagerExt;

type SharedState = Arc<AppState>;

fn show_dashboard(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn executable(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let current = std::env::current_exe()
        .map_err(|_| "Le dossier de l’application est indisponible.".to_owned())?;
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| "Le dossier des ressources est indisponible.".to_owned())?;
    let bundled = engine::bundled_executable(&current, &resources);
    #[cfg(debug_assertions)]
    if bundled.is_err() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../..");
        for relative in [
            "rust/target/release/agent-burn.exe",
            "rust/target/x86_64-pc-windows-msvc/release/agent-burn.exe",
            "rust/target/aarch64-pc-windows-msvc/release/agent-burn.exe",
        ] {
            let candidate = root.join(relative);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    bundled
}

fn data_directory(app: &tauri::App) -> Result<PathBuf, Box<dyn std::error::Error>> {
    #[cfg(debug_assertions)]
    if let Some(directory) = std::env::var_os("AGENT_BURN_TEST_DATA_DIR") {
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            return Err("AGENT_BURN_TEST_DATA_DIR must be absolute".into());
        }
        return Ok(directory);
    }
    Ok(app.path().app_data_dir()?)
}

async fn collect(
    app: &tauri::AppHandle,
    state: &AppState,
    query: Query,
    force: bool,
) -> Result<ReportEnvelope, String> {
    let engine_query = query.clone();
    state
        .load_with(query, force, |settings| async move {
            engine::run(
                &executable(app)?,
                &state.directory,
                &engine_query,
                &settings,
            )
            .await
        })
        .await
}

#[tauri::command]
fn get_cached_report(
    state: tauri::State<'_, SharedState>,
    period: String,
    source: String,
) -> Result<Option<ReportEnvelope>, String> {
    state.cached_report(&Query::new(&period, &source)?)
}

#[tauri::command]
async fn load_report(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
    period: String,
    source: String,
    force: bool,
) -> Result<ReportEnvelope, String> {
    collect(&app, &state, Query::new(&period, &source)?, force).await
}

#[tauri::command]
fn get_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<Settings, String> {
    let mut settings = state.settings()?;
    settings.launch_at_login = app
        .autolaunch()
        .is_enabled()
        .map_err(|_| "Windows n’a pas pu lire le démarrage automatique.".to_owned())?;
    Ok(settings)
}

#[tauri::command]
async fn save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
    settings: Settings,
) -> Result<Settings, String> {
    let settings = settings.validate()?;
    let _gate = state.gate.lock().await;
    let currently_enabled = app
        .autolaunch()
        .is_enabled()
        .map_err(|_| "Windows n’a pas pu lire le démarrage automatique.".to_owned())?;
    state.save_with_startup(settings, currently_enabled, |enabled| {
        let result = if enabled {
            app.autolaunch().enable()
        } else {
            app.autolaunch().disable()
        };
        result.map_err(|_| "Windows n’a pas pu modifier le démarrage automatique.".to_owned())
    })
}

#[tauri::command]
fn get_history(state: tauri::State<'_, SharedState>) -> Result<Vec<HistorySample>, String> {
    state.history()
}

#[tauri::command]
fn open_data_folder(state: tauri::State<'_, SharedState>) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let windows = std::env::var_os("WINDIR")
            .ok_or_else(|| "Le dossier Windows est introuvable.".to_owned())?;
        std::process::Command::new(PathBuf::from(windows).join("explorer.exe"))
            .arg(&state.directory)
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|_| {
                "L’Explorateur de fichiers n’a pas pu ouvrir les données locales.".to_owned()
            })?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = state;
        Err("Cette application est destinée à Windows.".into())
    }
}

fn start_collector(app: tauri::AppHandle, state: SharedState) {
    tauri::async_runtime::spawn(async move {
        let mut force = false;
        loop {
            let result = state
                .collect_quota_with(|settings| {
                    let app = &app;
                    let state = &state;
                    async move {
                        engine::run_quota(
                            &executable(app)?,
                            &state.directory,
                            &settings.quota_source,
                            &settings,
                        )
                        .await
                    }
                })
                .await;
            let tooltip = match &result {
                Ok((source, Some(sample))) => format!(
                    "Agent Burn · {} · {:.0} % utilisé",
                    source, sample.used_percent
                ),
                Ok((_, None)) => "Agent Burn · quota live indisponible".into(),
                Err(_) => "Agent Burn · relevé indisponible".into(),
            };
            if let Some(tray) = app.tray_by_id("agent-burn") {
                let _ = tray.set_tooltip(Some(tooltip));
            }
            let _ = app.emit("usage-updated", ());
            if force {
                let _ = app.emit("refresh-requested", ());
            }
            let minutes = state
                .settings()
                .map(|value| value.refresh_minutes)
                .unwrap_or(5);
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(u64::from(minutes) * 60)) => { force = false; }
                _ = state.wake.notified() => { force = true; }
            }
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_dashboard(app)
        }))
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--background"])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            get_cached_report,
            load_report,
            get_settings,
            save_settings,
            get_history,
            open_data_folder
        ])
        .setup(|app| {
            let directory = data_directory(app)?;
            let state = Arc::new(AppState::new(directory).map_err(std::io::Error::other)?);
            app.manage(state.clone());
            let open = MenuItem::with_id(app, "open", "Ouvrir Agent Burn", true, None::<&str>)?;
            let refresh = MenuItem::with_id(app, "refresh", "Actualiser", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &refresh, &quit])?;
            let mut tray = TrayIconBuilder::with_id("agent-burn")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Agent Burn")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_dashboard(app),
                    "refresh" => app.state::<SharedState>().wake.notify_one(),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if matches!(
                        event,
                        TrayIconEvent::DoubleClick {
                            button: MouseButton::Left,
                            ..
                        }
                    ) {
                        show_dashboard(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            if !std::env::args().any(|arg| arg == "--background") {
                show_dashboard(app.handle());
            }
            start_collector(app.handle().clone(), state);
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<SharedState>();
                if state
                    .settings()
                    .map(|value| value.close_to_tray)
                    .unwrap_or(false)
                {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    window.app_handle().exit(0);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Agent Burn n’a pas pu démarrer. Vérifiez les données locales et WebView2.");
}
