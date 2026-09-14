import type { Period, Settings, Source } from './contracts.ts';

export function reportKey(source: Source, period: Period, settings: Settings) {
	return JSON.stringify([
		source,
		period,
		settings.offline,
		settings.codexHomes,
		settings.claudeConfigDir,
		settings.cursorDataDir,
	]);
}
