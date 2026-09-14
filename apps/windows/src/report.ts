import type { Source } from './contracts.ts';

export interface UsageRow {
	name: string;
	cost: number;
	tokens: number;
}

export interface DailyUsage {
	date: string;
	cost: number;
	tokens: number | null;
}

export interface UsageReport {
	totalCost: number;
	totalTokens: number | null;
	sources: UsageRow[];
	models: UsageRow[];
	daily: DailyUsage[];
	quota: Quota | null;
	plan: string | null;
	pricePerMonth: number | null;
	partialModels: boolean;
}

export interface Quota {
	kind: 'window' | 'credits' | 'cycle';
	usedPercent: number;
	elapsedPercent: number | null;
	windowMinutes: number | null;
	endsAt: number | null;
	live: boolean;
}

function record(value: unknown): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Le moteur a renvoyé un rapport illisible. Relancez l’actualisation.');
	}
	return value as Record<string, unknown>;
}

function amount(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
		throw new Error('Le rapport contient une valeur invalide. Relancez l’actualisation.');
	}
	return value;
}

function rows(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function usageRows(value: unknown, nameKey: string): UsageRow[] {
	return rows(value)
		.map((item) => {
			const row = record(item);
			return {
				name: String(row[nameKey]),
				cost: amount(row.totalCost),
				tokens: amount(row.totalTokens),
			};
		})
		.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
}

function dailyRows(value: unknown): DailyUsage[] {
	return rows(value)
		.map((item) => {
			const row = record(item);
			return {
				date: String(row.date),
				cost: amount(row.cost),
				tokens: row.tokens == null ? null : amount(row.tokens),
			};
		})
		.sort((a, b) => a.date.localeCompare(b.date));
}

export function normalizeReport(raw: unknown, source: Source): UsageReport {
	const report = record(raw);
	if (source === 'codex' || source === 'claude') {
		if (
			report.agent !== source ||
			!Array.isArray(report.topModels) ||
			!Array.isArray(report.daily)
		) {
			throw new Error('Le moteur a renvoyé un rapport inattendu. Relancez l’actualisation.');
		}
		const models = rows(report.topModels).map((item) => {
			const row = record(item);
			return { name: String(row.model), cost: amount(row.cost), tokens: amount(row.tokens) };
		});
		const totalTokens =
			Array.isArray(report.spendMix) && report.spendMix.length > 0
				? report.spendMix.reduce(
						(total: number, item: unknown) => total + amount(record(item).tokens),
						0,
					)
				: null;
		return {
			totalCost: amount(report.apiEquivalentPerMonth),
			totalTokens,
			sources: [],
			models,
			daily: dailyRows(report.daily),
			quota: quotaWindow(report.window, report.liveLimits === true),
			plan: typeof report.plan === 'string' ? report.plan : null,
			pricePerMonth: report.pricePerMonth == null ? null : amount(report.pricePerMonth),
			partialModels: true,
		};
	}
	if (!Array.isArray(report.agents) || !Array.isArray(report.models)) {
		throw new Error('Le moteur a renvoyé un rapport incomplet. Relancez l’actualisation.');
	}
	const summaryTotals = record(report.totals);
	const agents = rows(report.agents).map(record);
	const selected = source === 'cursor' ? agents.find((agent) => agent.agent === 'cursor') : null;
	const totals =
		source === 'cursor' ? (selected ?? { totalCost: 0, totalTokens: 0 }) : summaryTotals;
	return {
		totalCost: amount(totals.totalCost),
		totalTokens: amount(totals.totalTokens),
		sources: usageRows(source === 'cursor' ? (selected ? [selected] : []) : agents, 'agent'),
		models: usageRows(source === 'cursor' ? selected?.models : report.models, 'model'),
		daily: dailyRows(source === 'cursor' ? selected?.daily : report.daily),
		quota: source === 'cursor' ? cursorQuota(report.cursorAccount) : null,
		plan: null,
		pricePerMonth: null,
		partialModels: false,
	};
}

function quotaWindow(value: unknown, live: boolean): Quota | null {
	if (value == null) return null;
	const window = record(value);
	const used = window.usedPercent;
	const elapsed = window.elapsedPercent;
	const minutes = window.windowMinutes;
	if (
		typeof used !== 'number' ||
		!Number.isFinite(used) ||
		used < 0 ||
		used > 100 ||
		typeof elapsed !== 'number' ||
		!Number.isFinite(elapsed) ||
		elapsed < 0 ||
		elapsed > 100 ||
		typeof minutes !== 'number' ||
		!Number.isFinite(minutes) ||
		minutes <= 0
	)
		return null;
	return {
		kind: 'window',
		usedPercent: used,
		elapsedPercent: elapsed,
		windowMinutes: minutes,
		endsAt: null,
		live,
	};
}

function cursorQuota(value: unknown): Quota | null {
	if (value == null) return null;
	const account = record(value);
	const used = account.activePercentUsed;
	if (typeof used !== 'number' || !Number.isFinite(used) || used < 0 || used > 100) return null;
	const grants = rows(account.grants)
		.map(record)
		.filter((grant) => typeof grant.remainingUSD === 'number' && grant.remainingUSD > 0);
	const credits = grants.length > 0;
	const expiryDates = grants
		.map((grant) => grant.expiresAtMs)
		.filter(
			(date): date is number => typeof date === 'number' && Number.isFinite(date) && date > 0,
		);
	const cycleEnd = account.billingCycleEndMs;
	const endsAt = credits
		? expiryDates.length > 0
			? Math.min(...expiryDates)
			: null
		: typeof cycleEnd === 'number' && Number.isFinite(cycleEnd) && cycleEnd > 0
			? cycleEnd
			: null;
	return {
		kind: credits ? 'credits' : 'cycle',
		usedPercent: used,
		elapsedPercent: null,
		windowMinutes: null,
		endsAt,
		live: true,
	};
}
