import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DEFAULT_SETTINGS } from './contracts.ts';
import type { HistoryPoint, Period, ReportEnvelope, Settings, Source } from './contracts.ts';
import { normalizeReport } from './report.ts';
import type { UsageReport } from './report.ts';
import { reportKey } from './report-key.ts';
import { loadReportWithCache } from './report-loading.ts';

interface LoadedReport {
	key: string;
	report: UsageReport;
	updatedAt: number;
	cached: boolean;
}

export function errorMessage(error: unknown): string {
	return error instanceof Error
		? error.message
		: typeof error === 'string'
			? error
			: 'La lecture a échoué. Réessayez dans un instant.';
}

export function useUsage(source: Source, period: Period) {
	const native = isTauri();
	const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
	const [ready, setReady] = useState(!native);
	const [loaded, setLoaded] = useState<LoadedReport | null>(null);
	const [loading, setLoading] = useState(native);
	const [error, setError] = useState<string | null>(null);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const [history, setHistory] = useState<HistoryPoint[]>([]);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [revision, setRevision] = useState(0);
	const reports = useRef(new Map<string, LoadedReport>());
	const force = useRef(false);
	const key = reportKey(source, period, settings);

	useEffect(() => {
		if (!native) return;
		let active = true;
		invoke<Settings>('get_settings')
			.then((value) => {
				if (active) setSettings(value);
			})
			.catch((reason: unknown) => {
				if (active) setSettingsError(errorMessage(reason));
			})
			.finally(() => {
				if (active) setReady(true);
			});
		return () => {
			active = false;
		};
	}, [native]);

	useEffect(() => {
		document.documentElement.dataset.theme = settings.theme;
	}, [settings.theme]);

	useEffect(() => {
		if (!native) return;
		let cancelled = false;
		const stops = [
			listen('usage-updated', () => {
				if (!cancelled) setRevision((value) => value + 1);
			}),
			listen('refresh-requested', () => {
				if (cancelled) return;
				force.current = true;
				setRevision((value) => value + 1);
			}),
		];
		for (const stop of stops) void stop.catch(() => undefined);
		return () => {
			cancelled = true;
			for (const stop of stops) void stop.then((unlisten) => unlisten()).catch(() => undefined);
		};
	}, [native]);

	useEffect(() => {
		if (!native || !ready) return;
		let active = true;
		const refresh = force.current;
		force.current = false;
		setLoading(true);
		setError(null);
		const cancelReport = loadReportWithCache({
			cached: invoke<ReportEnvelope | null>('get_cached_report', { source, period }),
			fresh: invoke<ReportEnvelope>('load_report', { source, period, force: refresh }),
			currentUpdatedAt: reports.current.get(key)?.updatedAt,
			onReport: (envelope) => {
				const next = {
					key,
					report: normalizeReport(envelope.report, source),
					updatedAt: envelope.updatedAt,
					cached: envelope.cached,
				} satisfies LoadedReport;
				reports.current.set(key, next);
				setLoaded(next);
			},
			onError: (reason) => setError(reason == null ? null : errorMessage(reason)),
			onSettled: () => setLoading(false),
		});
		invoke<HistoryPoint[]>('get_history')
			.then((points) => {
				if (active) {
					setHistory(points);
					setHistoryError(null);
				}
			})
			.catch(() => {
				if (active) setHistoryError('L’historique des quotas n’a pas pu être chargé.');
			});
		return () => {
			active = false;
			cancelReport();
		};
	}, [native, ready, source, period, key, revision]);

	const refresh = useCallback(() => {
		force.current = true;
		setRevision((value) => value + 1);
	}, []);

	const saveSettings = useCallback(async (next: Settings) => {
		const saved = await invoke<Settings>('save_settings', { settings: next });
		setSettings(saved);
		setSettingsError(null);
		force.current = true;
		setRevision((value) => value + 1);
	}, []);

	const visible = loaded?.key === key ? loaded : reports.current.get(key);
	return {
		native,
		settings,
		settingsError,
		loaded: visible
			? { ...visible, cached: visible.cached || loading || loaded?.key !== key }
			: null,
		loading,
		error,
		history,
		historyError,
		refresh,
		saveSettings,
	};
}
