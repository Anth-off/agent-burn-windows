use crate::service::HistorySample;
use serde_json::Value;

pub(crate) fn parse_snapshot(
    source: &str,
    report: &Value,
    now: u64,
) -> Result<Option<HistorySample>, String> {
    let invalid = || {
        "Le relevé live est absent, ancien ou invalide. Le dernier historique est conservé."
            .to_owned()
    };
    let at = report["observedAt"].as_u64().ok_or_else(invalid)?;
    if report["agent"].as_str() != Some(source) || now.abs_diff(at) > 90_000 {
        return Err(invalid());
    }
    if source == "cursor" && report["window"].is_null() {
        return Ok(None);
    }
    let window = &report["window"];
    let used_percent = window["usedPercent"].as_f64().ok_or_else(invalid)?;
    let minutes = window["windowMinutes"].as_f64().ok_or_else(invalid)?;
    let elapsed = window["elapsedPercent"].as_f64().ok_or_else(invalid)?;
    if !used_percent.is_finite()
        || !(0.0..=100.0).contains(&used_percent)
        || !minutes.is_finite()
        || minutes <= 0.0
        || !elapsed.is_finite()
        || !(0.0..100.0).contains(&elapsed)
    {
        return Err(invalid());
    }
    Ok(Some(HistorySample {
        at,
        source: source.into(),
        used_percent,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn records_strict_observation_time_instead_of_relabeling_cached_reports() {
        let reading = parse_snapshot("codex", &json!({"agent":"codex","observedAt":1_000_000,"window":{"windowMinutes":10080,"usedPercent":24.0,"elapsedPercent":30.0}}), 1_010_000).unwrap().unwrap();
        assert_eq!(reading.at, 1_000_000);
        assert_eq!(reading.used_percent, 24.0);
        assert!(
            parse_snapshot(
                "codex",
                &json!({"agent":"codex","liveLimits":true,"window":{"usedPercent":24.0}}),
                1_010_000
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_stale_expired_or_mismatched_snapshots() {
        assert!(parse_snapshot("codex", &json!({"agent":"codex","observedAt":1,"window":{"windowMinutes":10080,"usedPercent":24.0,"elapsedPercent":30.0}}), 1_010_000).is_err());
        assert!(parse_snapshot("codex", &json!({"agent":"codex","observedAt":1_000_000,"window":{"windowMinutes":10080,"usedPercent":24.0,"elapsedPercent":100.0}}), 1_010_000).is_err());
        assert!(
            parse_snapshot(
                "claude",
                &json!({"agent":"codex","observedAt":1_000_000}),
                1_010_000
            )
            .is_err()
        );
    }

    #[test]
    fn missing_cursor_window_does_not_invent_a_zero() {
        assert!(
            parse_snapshot(
                "cursor",
                &json!({"agent":"cursor","observedAt":1_000_000}),
                1_010_000
            )
            .unwrap()
            .is_none()
        );
    }
}
