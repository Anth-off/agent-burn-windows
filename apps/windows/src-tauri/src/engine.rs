use crate::{
    report::{Query, validate_report},
    settings::Settings,
};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    time::timeout,
};

const OUTPUT_LIMIT: u64 = 16_000_000;

pub(crate) fn bundled_executable(current_exe: &Path, resources: &Path) -> Result<PathBuf, String> {
    let sibling = current_exe
        .parent()
        .map(|parent| parent.join("agent-burn.exe"));
    sibling
        .into_iter()
        .chain([resources.join("agent-burn.exe")])
        .find(|path| path.is_file())
        .ok_or_else(|| "Le moteur Agent Burn est absent. Réinstallez l’application.".into())
}

pub(crate) async fn run(
    executable: &Path,
    data_directory: &Path,
    query: &Query,
    settings: &Settings,
) -> Result<Value, String> {
    let report = run_process(executable, data_directory, query, settings, false).await?;
    validate_report(query, &report)?;
    Ok(report)
}

pub(crate) async fn run_quota(
    executable: &Path,
    data_directory: &Path,
    source: &str,
    settings: &Settings,
) -> Result<Option<crate::service::HistorySample>, String> {
    if settings.offline {
        return Ok(None);
    }
    let query = Query::new("all", source)?;
    let report = run_process(executable, data_directory, &query, settings, true).await?;
    crate::quota::parse_snapshot(source, &report, crate::service::now_ms())
}

async fn run_process(
    executable: &Path,
    data_directory: &Path,
    query: &Query,
    settings: &Settings,
    quota_only: bool,
) -> Result<Value, String> {
    let mut command = Command::new(executable);
    command
        .args(query.arguments(settings.offline))
        .current_dir(data_directory)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        // This private collector flag must not leak from a parent terminal.
        .env_remove("AGENT_BURN_QUOTA_ONLY")
        .env("NO_COLOR", "1");
    if quota_only {
        command.env("AGENT_BURN_QUOTA_ONLY", "1");
    }
    for (name, value) in [
        ("CODEX_HOME", &settings.codex_homes),
        ("CLAUDE_CONFIG_DIR", &settings.claude_config_dir),
        ("CURSOR_DATA_DIR", &settings.cursor_data_dir),
    ] {
        if !value.is_empty() {
            command.env(name, value);
        }
    }
    #[cfg(windows)]
    command.creation_flags(0x0800_0000); // CREATE_NO_WINDOW

    let mut child = command
        .spawn()
        .map_err(|_| "Le moteur Agent Burn n’a pas pu démarrer.".to_owned())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "La sortie du moteur est indisponible.".to_owned())?;
    let execution = async {
        let output = read_bounded(stdout, OUTPUT_LIMIT).await?;
        let status = child
            .wait()
            .await
            .map_err(|_| "Le moteur Agent Burn a été interrompu.".to_owned())?;
        if !status.success() {
            return Err("Le relevé a échoué. Vérifiez les dossiers de données et la connexion de l’agent, puis réessayez.".into());
        }
        let report: Value = serde_json::from_slice(&output)
            .map_err(|_| "Le moteur a renvoyé un rapport illisible.".to_owned())?;
        Ok(report)
    };
    match timeout(Duration::from_secs(120), execution).await {
        Ok(Ok(report)) => Ok(report),
        Ok(Err(error)) => {
            let _ = child.kill().await;
            Err(error)
        }
        Err(_) => {
            let _ = child.kill().await;
            Err("Le relevé a dépassé le délai de deux minutes. Réessayez plus tard.".into())
        }
    }
}

async fn read_bounded(reader: impl AsyncRead + Unpin, limit: u64) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    reader
        .take(limit + 1)
        .read_to_end(&mut output)
        .await
        .map_err(|_| "La sortie du moteur n’a pas pu être lue.".to_owned())?;
    if output.len() as u64 > limit {
        return Err("Le rapport dépasse la taille maximale autorisée.".into());
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn refuses_output_above_the_limit_before_buffering_everything() {
        let source = std::io::Cursor::new(vec![b'a'; 65]);
        assert!(read_bounded(source, 64).await.is_err());
        assert_eq!(
            read_bounded(std::io::Cursor::new(b"{}"), 64).await.unwrap(),
            b"{}"
        );
    }

    #[test]
    fn resolves_only_bundled_binary_and_never_searches_the_path() {
        let dir = tempfile::tempdir().unwrap();
        assert!(bundled_executable(&dir.path().join("app.exe"), dir.path()).is_err());
        std::fs::write(dir.path().join("agent-burn.exe"), "fixture").unwrap();
        assert_eq!(
            bundled_executable(&dir.path().join("app.exe"), dir.path()).unwrap(),
            dir.path().join("agent-burn.exe")
        );
    }
}
