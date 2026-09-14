import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DEFAULT_SETTINGS } from './contracts.ts';
import { reportKey } from './report-key.ts';

it('invalidates visible usage after changing a source directory', () => {
	assert.notEqual(
		reportKey('summary', 'month', DEFAULT_SETTINGS),
		reportKey('summary', 'month', { ...DEFAULT_SETTINGS, codexHomes: 'D:\\sessions' }),
	);
});
it('invalidates visible usage when offline mode changes', () => {
	assert.notEqual(
		reportKey('codex', 'month', DEFAULT_SETTINGS),
		reportKey('codex', 'month', { ...DEFAULT_SETTINGS, offline: true }),
	);
});
it('keeps visible usage when only appearance changes', () => {
	assert.equal(
		reportKey('summary', 'month', DEFAULT_SETTINGS),
		reportKey('summary', 'month', { ...DEFAULT_SETTINGS, theme: 'dark' }),
	);
});
