export type Source = 'summary' | 'codex' | 'claude' | 'cursor';
export type Period = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'wtd' | 'mtd' | 'ytd';

export interface Settings {
	refreshMinutes: number;
	launchAtLogin: boolean;
	closeToTray: boolean;
	offline: boolean;
	codexHomes: string;
	claudeConfigDir: string;
	cursorDataDir: string;
	theme: 'system' | 'light' | 'dark';
	quotaSource: Exclude<Source, 'summary'>;
}

export interface ReportEnvelope {
	report: unknown;
	updatedAt: number;
	cached: boolean;
	error: string | null;
}

export interface HistoryPoint {
	at: number;
	source: string;
	usedPercent: number;
}

export const DEFAULT_SETTINGS = {
	refreshMinutes: 5,
	launchAtLogin: false,
	closeToTray: true,
	offline: false,
	codexHomes: '',
	claudeConfigDir: '',
	cursorDataDir: '',
	theme: 'system',
	quotaSource: 'codex',
} satisfies Settings;

export const SOURCES = [
	{ key: 'summary', label: 'Général' },
	{ key: 'codex', label: 'Codex' },
	{ key: 'claude', label: 'Claude' },
	{ key: 'cursor', label: 'Cursor' },
] as const satisfies readonly { key: Source; label: string }[];

export const PERIODS = [
	{ key: 'today', label: 'Aujourd’hui' },
	{ key: 'yesterday', label: 'Hier' },
	{ key: 'week', label: '7 derniers jours' },
	{ key: 'month', label: '30 derniers jours' },
	{ key: 'wtd', label: 'Cette semaine' },
	{ key: 'mtd', label: 'Ce mois-ci' },
	{ key: 'ytd', label: 'Cette année' },
	{ key: 'all', label: 'Tout l’historique' },
] as const satisfies readonly { key: Period; label: string }[];
