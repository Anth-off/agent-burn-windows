import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeReport } from './report.ts';

describe('normalizeReport', () => {
	it('keeps an empty successful report distinct from an unavailable report', () => {
		const report = normalizeReport(
			{ totals: { totalCost: 0, totalTokens: 0 }, agents: [], models: [] },
			'summary',
		);
		assert.equal(report.totalCost, 0);
		assert.equal(report.totalTokens, 0);
		assert.deepEqual(report.sources, []);
	});
	it('preserves summary totals and source-specific details', () => {
		const report = normalizeReport(
			{
				totals: { totalCost: 12.5, totalTokens: 200 },
				agents: [{ agent: 'codex', totalCost: 12.5, totalTokens: 200 }],
				models: [{ model: 'gpt-5.4', totalCost: 12.5, totalTokens: 200 }],
				daily: [{ date: '2026-05-01', cost: 12.5, tokens: 200 }],
			},
			'summary',
		);
		assert.equal(report.totalCost, 12.5);
		assert.equal(report.totalTokens, 200);
		assert.equal(report.models[0]?.name, 'gpt-5.4');
		assert.equal(report.daily[0]?.cost, 12.5);
		assert.equal(report.sources[0]?.name, 'codex');
	});
	it('isolates Cursor instead of displaying the aggregate from other agents', () => {
		const report = normalizeReport(
			{
				totals: { totalCost: 120, totalTokens: 3000 },
				agents: [
					{ agent: 'codex', totalCost: 100, totalTokens: 2500 },
					{
						agent: 'cursor',
						totalCost: 20,
						totalTokens: 500,
						models: [{ model: 'auto', totalCost: 20, totalTokens: 500 }],
						daily: [{ date: '2026-05-01', cost: 20 }],
					},
				],
				models: [],
			},
			'cursor',
		);
		assert.equal(report.totalCost, 20);
		assert.equal(report.totalTokens, 500);
		assert.equal(report.models[0]?.name, 'auto');
		assert.equal(report.daily[0]?.cost, 20);
		assert.equal(report.sources.length, 1);
	});
	it('does not present six top models as the complete harness token total', () => {
		const report = normalizeReport(
			{
				agent: 'codex',
				apiEquivalentPerMonth: 90,
				topModels: [{ model: 'gpt-5.4', cost: 70, tokens: 120 }],
				daily: [],
				liveLimits: false,
			},
			'codex',
		);
		assert.equal(report.totalTokens, null);
		assert.equal(report.totalCost, 90);
		assert.equal(report.models[0]?.tokens, 120);
	});
	it('uses the full spend mix when harness token totals are available', () => {
		const report = normalizeReport(
			{
				agent: 'claude',
				apiEquivalentPerMonth: 90,
				topModels: [],
				daily: [],
				liveLimits: false,
				spendMix: [{ tokens: 100 }, { tokens: 25 }],
			},
			'claude',
		);
		assert.equal(report.totalTokens, 125);
	});
	it('accepts fully consumed quota', () => {
		const report = normalizeReport(
			{
				agent: 'codex',
				apiEquivalentPerMonth: 0,
				topModels: [],
				daily: [],
				liveLimits: true,
				window: { usedPercent: 100, elapsedPercent: 50, windowMinutes: 10080 },
			},
			'codex',
		);
		assert.equal(report.quota?.usedPercent, 100);
		assert.equal(report.quota?.live, true);
	});
	it('does not expose invalid quota readings', () => {
		const report = normalizeReport(
			{
				agent: 'claude',
				apiEquivalentPerMonth: 0,
				topModels: [],
				daily: [],
				liveLimits: true,
				window: { usedPercent: 110, elapsedPercent: 50, windowMinutes: 10080 },
			},
			'claude',
		);
		assert.equal(report.quota, null);
	});
	it('rejects malformed reports instead of displaying false zero usage', () => {
		assert.throws(() => normalizeReport({}, 'cursor'), /rapport/i);
	});
	it('rejects another harness report instead of attributing its usage to the selected agent', () => {
		assert.throws(
			() => normalizeReport({ agent: 'claude', apiEquivalentPerMonth: 10 }, 'codex'),
			/rapport/i,
		);
	});
	it('distinguishes Cursor promotional credits and their expiry from a quota reset', () => {
		const report = normalizeReport(
			{
				totals: { totalCost: 0, totalTokens: 0 },
				agents: [],
				models: [],
				cursorAccount: {
					activePercentUsed: 25,
					billingCycleStartMs: 1000,
					billingCycleEndMs: 9000,
					grants: [{ kind: 'promo', totalUSD: 100, remainingUSD: 75, expiresAtMs: 5000 }],
				},
			},
			'cursor',
		);
		assert.equal(report.quota?.kind, 'credits');
		assert.equal(report.quota?.usedPercent, 25);
		assert.equal(report.quota?.endsAt, 5000);
		assert.equal(report.quota?.windowMinutes, null);
	});
	it('uses the Cursor billing cycle when no active credit grant remains', () => {
		const report = normalizeReport(
			{
				totals: { totalCost: 0, totalTokens: 0 },
				agents: [],
				models: [],
				cursorAccount: {
					activePercentUsed: 50,
					billingCycleStartMs: 1000,
					billingCycleEndMs: 9000,
					grants: [],
				},
			},
			'cursor',
		);
		assert.equal(report.quota?.kind, 'cycle');
		assert.equal(report.quota?.endsAt, 9000);
	});
});
