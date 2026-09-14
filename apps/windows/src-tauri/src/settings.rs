use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(default, rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Settings {
    pub refresh_minutes: u32,
    pub launch_at_login: bool,
    pub close_to_tray: bool,
    pub offline: bool,
    pub codex_homes: String,
    pub claude_config_dir: String,
    pub cursor_data_dir: String,
    pub theme: String,
    pub quota_source: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            refresh_minutes: 5,
            launch_at_login: false,
            close_to_tray: true,
            offline: false,
            codex_homes: String::new(),
            claude_config_dir: String::new(),
            cursor_data_dir: String::new(),
            theme: "system".into(),
            quota_source: "codex".into(),
        }
    }
}

impl Settings {
    pub(crate) fn validate(mut self) -> Result<Self, String> {
        if !(1..=60).contains(&self.refresh_minutes) {
            return Err("L’actualisation doit être comprise entre 1 et 60 minutes.".into());
        }
        if !matches!(self.theme.as_str(), "system" | "light" | "dark")
            || !matches!(self.quota_source.as_str(), "codex" | "claude" | "cursor")
        {
            return Err("Le thème ou la source du quota est invalide.".into());
        }
        self.codex_homes = normalize_paths(&self.codex_homes, true)?;
        self.claude_config_dir = normalize_paths(&self.claude_config_dir, true)?;
        self.cursor_data_dir = normalize_paths(&self.cursor_data_dir, false)?;
        Ok(self)
    }
}

fn normalize_paths(value: &str, multiple: bool) -> Result<String, String> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }
    if value.len() > 8192 || value.chars().any(char::is_control) {
        return Err("Le dossier contient des caractères invalides ou un chemin trop long.".into());
    }
    let parts: Vec<_> = if multiple {
        value.split(',').collect()
    } else {
        vec![value]
    };
    let mut paths = Vec::new();
    for part in parts {
        let path = part.trim();
        if path.is_empty() || !Path::new(path).is_absolute() {
            return Err("Indiquez un chemin absolu pour chaque dossier de données.".into());
        }
        paths.push(path);
    }
    Ok(paths.join(","))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_keep_startup_opt_in_and_collect_every_five_minutes() {
        let settings = Settings::default();
        assert_eq!(settings.refresh_minutes, 5);
        assert!(!settings.launch_at_login);
        assert!(settings.close_to_tray);
        assert_eq!(settings.clone().validate(), Ok(settings));
    }

    #[test]
    fn rejects_refresh_intervals_outside_one_to_sixty_minutes() {
        assert!(
            Settings {
                refresh_minutes: 0,
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
        assert!(
            Settings {
                refresh_minutes: 61,
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn trims_absolute_data_directories_without_interpreting_commands() {
        let settings = Settings {
            codex_homes: " C:\\fixtures\\one, D:\\fixtures\\two ".into(),
            ..Settings::default()
        };
        assert_eq!(
            settings.validate().unwrap().codex_homes,
            "C:\\fixtures\\one,D:\\fixtures\\two"
        );
    }

    #[test]
    fn rejects_relative_paths_and_control_characters() {
        assert!(
            Settings {
                cursor_data_dir: "../other".into(),
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
        assert!(
            Settings {
                claude_config_dir: "C:\\fixtures\nsecret".into(),
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
    }

    #[test]
    fn rejects_unknown_theme_or_quota_source() {
        assert!(
            Settings {
                theme: "remote".into(),
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
        assert!(
            Settings {
                quota_source: "summary".into(),
                ..Settings::default()
            }
            .validate()
            .is_err()
        );
    }
}
