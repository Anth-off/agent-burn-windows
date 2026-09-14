import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chartDays, recordedQuotaPoints } from './chart-data.ts';

describe('chartDays', () => {
	it('preserves calendar spacing and adds no invented usage days', () => {
		const result = chartDays([
			{ date: '2026-01-01', cost: 4, tokens: null },
			{ date: '2026-01-03', cost: 8, tokens: 30 },
		]);
		assert.equal(result.length, 2);
		assert.equal((result[1]?.at ?? 0) - (result[0]?.at ?? 0), 2 * 86400000);
	});
	it('omits impossible dates without drawing misleading bars', () => {
		assert.deepEqual(chartDays([{ date: '2026-02-30', cost: 8, tokens: null }]), []);
	});
});

describe('recordedQuotaPoints', () => {
	it('keeps only valid measurements for the selected agent without interpolating gaps', () => {
		const samples = recordedQuotaPoints(
			[
				{ at: 1000, source: 'codex', usedPercent: 15 },
				{ at: 2000, source: 'claude', usedPercent: 60 },
				{ at: 500000, source: 'codex', usedPercent: 70 },
				{ at: 600000, source: 'codex', usedPercent: 102 },
			],
			'codex',
		);
		assert.deepEqual(
			samples.map((point) => point.at),
			[1000, 500000],
		);
	});
});
