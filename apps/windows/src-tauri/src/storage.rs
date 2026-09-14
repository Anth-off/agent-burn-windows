use serde::{Serialize, de::DeserializeOwned};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

pub(crate) struct Recovered<T> {
    pub(crate) value: T,
    pub(crate) writable: bool,
    pub(crate) notice: Option<String>,
}

pub(crate) fn recover_json<T: DeserializeOwned + Default>(path: &Path) -> Recovered<T> {
    match read_json(path) {
        Ok(value) => Recovered {
            value: value.unwrap_or_default(),
            writable: true,
            notice: None,
        },
        Err(_) => recover_invalid(path),
    }
}

pub(crate) fn recover_invalid<T: Default>(path: &Path) -> Recovered<T> {
    let writable = preserve_originals(path).is_ok();
    let notice = if writable {
        "Certaines données locales étaient illisibles. Les fichiers originaux ont été conservés dans le dossier recovery ; les données disponibles restent accessibles."
    } else {
        "Certaines données locales sont illisibles et restent conservées en place. Leur écriture est désactivée pour les protéger."
    };
    Recovered {
        value: T::default(),
        writable,
        notice: Some(notice.into()),
    }
}

fn preserve_originals(path: &Path) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::other("missing parent"))?;
    let recovery = parent.join("recovery");
    fs::create_dir_all(&recovery)?;
    for original in [path.to_owned(), path.with_extension("json.bak")] {
        if !original.exists() {
            continue;
        }
        let mut source = fs::File::open(&original)?;
        let mut copy = tempfile::Builder::new()
            .prefix(
                original
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .unwrap_or("data"),
            )
            .suffix(".json")
            .tempfile_in(&recovery)?;
        io::copy(&mut source, &mut copy)?;
        copy.as_file().sync_all()?;
        copy.keep().map_err(io::Error::other)?;
    }
    Ok(())
}

pub(crate) fn read_json<T: DeserializeOwned>(path: &Path) -> Result<Option<T>, String> {
    let read = |candidate: &Path| -> Result<T, io::Error> {
        serde_json::from_slice(&fs::read(candidate)?).map_err(io::Error::other)
    };
    match read(path) {
        Ok(value) => Ok(Some(value)),
        Err(primary) => match read(&path.with_extension("json.bak")) {
            Ok(value) => Ok(Some(value)),
            Err(backup) if primary.kind() == io::ErrorKind::NotFound && backup.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err("Les données locales sont illisibles. Leur copie de sauvegarde n’a pas pu être restaurée.".into()),
        }
    }
}

pub(crate) fn save_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
    let data = serde_json::to_vec(value)
        .map_err(|_| "Les données ne peuvent pas être enregistrées.".to_owned())?;
    if let Ok(previous) = fs::read(path)
        && serde_json::from_slice::<serde_json::Value>(&previous).is_ok()
    {
        atomic_write(&path.with_extension("json.bak"), &previous)?;
    }
    atomic_write(path, &data)
}

fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let save = || -> io::Result<()> {
        let parent = path
            .parent()
            .ok_or_else(|| io::Error::other("missing parent"))?;
        fs::create_dir_all(parent)?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
        temporary.write_all(data)?;
        temporary.as_file().sync_all()?;
        temporary.persist(path).map_err(io::Error::other)?;
        Ok(())
    };
    save().map_err(|_| "Impossible d’enregistrer les données locales. Vérifiez l’espace disque et les droits d’accès.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn atomic_save_replaces_data_and_keeps_previous_valid_copy() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        save_json(&path, &json!({"version":1})).unwrap();
        save_json(&path, &json!({"version":2})).unwrap();
        assert_eq!(
            read_json::<serde_json::Value>(&path).unwrap(),
            Some(json!({"version":2}))
        );
        assert_eq!(
            read_json::<serde_json::Value>(&path.with_extension("json.bak")).unwrap(),
            Some(json!({"version":1}))
        );
    }

    #[test]
    fn recovers_valid_backup_after_a_corrupt_primary_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("history.json");
        save_json(&path, &json!([1])).unwrap();
        save_json(&path, &json!([1, 2])).unwrap();
        std::fs::write(&path, "interrupted").unwrap();
        assert_eq!(
            read_json::<serde_json::Value>(&path).unwrap(),
            Some(json!([1]))
        );
        save_json(&path, &json!([1, 3])).unwrap();
        assert_eq!(
            read_json::<serde_json::Value>(&path.with_extension("json.bak")).unwrap(),
            Some(json!([1]))
        );
    }

    #[test]
    fn missing_storage_is_empty_but_corruption_is_not_silently_reset() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(read_json::<serde_json::Value>(&path).unwrap(), None);
        std::fs::write(&path, "broken").unwrap();
        assert!(read_json::<serde_json::Value>(&path).is_err());
    }
}
