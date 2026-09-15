import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { it } from 'node:test';
import type { ReportEnvelope } from './contracts.ts';
import { loadReportWithCache } from './report-loading.ts';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((accept, fail) => {
		resolve = accept;
		reject = fail;
	});
	return { promise, resolve, reject };
}

it('shows the saved report while the fresh report is still pending', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	let settled = false;
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: () => {},
		onSettled: () => {
			settled = true;
		},
	});
	const saved = {
		report: { value: 10 },
		updatedAt: 100,
		cached: true,
		error: null,
	} satisfies ReportEnvelope;
	cached.resolve(saved);
	await setImmediate();
	assert.deepEqual(reports, [saved]);
	assert.equal(settled, false);
	fresh.resolve({ report: { value: 20 }, updatedAt: 200, cached: false, error: null });
	await setImmediate();
	assert.equal(reports.at(-1)?.updatedAt, 200);
	assert.equal(settled, true);
});

it('does not let a late saved report replace the fresh report', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: () => {},
		onSettled: () => {},
	});
	const current = {
		report: { value: 20 },
		updatedAt: 200,
		cached: false,
		error: null,
	} satisfies ReportEnvelope;
	fresh.resolve(current);
	await setImmediate();
	cached.resolve({ report: { value: 10 }, updatedAt: 100, cached: true, error: null });
	await setImmediate();
	assert.deepEqual(reports, [current]);
});
it('preserves the refresh error when a saved report arrives after failure', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	const errors: unknown[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: (error) => errors.push(error),
		onSettled: () => {},
	});
	fresh.reject('Connection unavailable');
	await setImmediate();
	const saved = {
		report: { value: 10 },
		updatedAt: 100,
		cached: true,
		error: null,
	} satisfies ReportEnvelope;
	cached.resolve(saved);
	await setImmediate();
	assert.deepEqual(reports, [saved]);
	assert.deepEqual(errors, ['Connection unavailable']);
});
it('ignores replies after changing the source or settings', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	const errors: unknown[] = [];
	let settled = false;
	const cancel = loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: (error) => errors.push(error),
		onSettled: () => {
			settled = true;
		},
	});
	cancel();
	cached.resolve({ report: { value: 10 }, updatedAt: 100, cached: true, error: null });
	fresh.reject('Connection unavailable');
	await setImmediate();
	assert.deepEqual(reports, []);
	assert.deepEqual(errors, []);
	assert.equal(settled, false);
});
it('keeps the visible report when the saved copy is older', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		currentUpdatedAt: 200,
		onReport: (report) => reports.push(report),
		onError: () => {},
		onSettled: () => {},
	});
	fresh.reject('Connection unavailable');
	await setImmediate();
	cached.resolve({ report: { value: 10 }, updatedAt: 100, cached: true, error: null });
	await setImmediate();
	assert.deepEqual(reports, []);
});
it('loads a fresh report when the saved copy cannot be read', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	const errors: unknown[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: (error) => errors.push(error),
		onSettled: () => {},
	});
	cached.reject('Unreadable archive');
	const current = {
		report: { value: 20 },
		updatedAt: 200,
		cached: false,
		error: null,
	} satisfies ReportEnvelope;
	fresh.resolve(current);
	await setImmediate();
	assert.deepEqual(reports, [current]);
	assert.equal(errors.filter(Boolean).length, 0);
});

it('keeps the fallback report and its refresh warning together', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	const errors: unknown[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: (error) => errors.push(error),
		onSettled: () => {},
	});
	const fallback = {
		report: { value: 20 },
		updatedAt: 200,
		cached: true,
		error: 'Connection unavailable',
	} satisfies ReportEnvelope;
	fresh.resolve(fallback);
	await setImmediate();
	cached.resolve({ report: { value: 10 }, updatedAt: 100, cached: true, error: null });
	await setImmediate();
	assert.deepEqual(reports, [fallback]);
	assert.deepEqual(errors, ['Connection unavailable']);
});

it('shows a saved report notice until a successful refresh clears it', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const errors: unknown[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: () => {},
		onError: (error) => errors.push(error),
		onSettled: () => {},
	});
	cached.resolve({
		report: { value: 10 },
		updatedAt: 100,
		cached: true,
		error: 'Archive recovered',
	});
	await setImmediate();
	assert.deepEqual(errors, ['Archive recovered']);
	fresh.resolve({ report: { value: 20 }, updatedAt: 200, cached: false, error: null });
	await setImmediate();
	assert.deepEqual(errors, ['Archive recovered', null]);
});

it('reports a missing fresh result without replacing the saved data', async () => {
	const cached = deferred<ReportEnvelope | null>();
	const fresh = deferred<ReportEnvelope>();
	const reports: ReportEnvelope[] = [];
	const errors: unknown[] = [];
	loadReportWithCache({
		cached: cached.promise,
		fresh: fresh.promise,
		onReport: (report) => reports.push(report),
		onError: (error) => errors.push(error),
		onSettled: () => {},
	});
	fresh.resolve({ report: null, updatedAt: 0, cached: false, error: null });
	await setImmediate();
	const saved = {
		report: { value: 10 },
		updatedAt: 100,
		cached: true,
		error: null,
	} satisfies ReportEnvelope;
	cached.resolve(saved);
	await setImmediate();
	assert.deepEqual(reports, [saved]);
	assert.match(String(errors[0]), /Aucun rapport disponible/);
});
