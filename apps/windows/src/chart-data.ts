import type { HistoryPoint } from './contracts.ts';
import type { DailyUsage } from './report.ts';

export function chartDays(days: DailyUsage[]) {
	return days
		.flatMap((day) => {
			if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) return [];
			const at = Date.parse(`${day.date}T00:00:00Z`);
			if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== day.date) return [];
			return [{ ...day, at }];
		})
		.sort((a, b) => a.at - b.at);
}

export function recordedQuotaPoints(points: HistoryPoint[], source: string) {
	return points
		.filter(
			(point) =>
				point.source === source &&
				Number.isFinite(point.at) &&
				point.at > 0 &&
				Number.isFinite(point.usedPercent) &&
				point.usedPercent >= 0 &&
				point.usedPercent <= 100,
		)
		.sort((a, b) => a.at - b.at);
}
