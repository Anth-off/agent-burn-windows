import assert from 'node:assert/strict';
import { it } from 'node:test';
import { nativeBuildPlan } from './native-plan.ts';

it('stages the Windows x64 CLI with the target suffix required by Tauri', () => {
	assert.deepEqual(nativeBuildPlan('x86_64-pc-windows-msvc'), {
		target: 'x86_64-pc-windows-msvc',
		binaryName: 'agent-burn.exe',
		stagedName: 'agent-burn-x86_64-pc-windows-msvc.exe',
		cargoArgs: [
			'build',
			'--manifest-path',
			'rust/Cargo.toml',
			'--locked',
			'--release',
			'--bin',
			'agent-burn',
			'--target',
			'x86_64-pc-windows-msvc',
		],
	});
});

it('keeps the ARM64 executable separate from the x64 executable', () => {
	assert.equal(
		nativeBuildPlan('aarch64-pc-windows-msvc').stagedName,
		'agent-burn-aarch64-pc-windows-msvc.exe',
	);
});

it('rejects unsupported targets before invoking a build', () => {
	assert.throws(() => nativeBuildPlan('x86_64-unknown-linux-gnu'), /Windows MSVC/);
});
