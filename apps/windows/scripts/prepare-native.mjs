import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeBuildPlan } from './native-plan.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const rustInfo = spawnSync('rustc', ['-vV'], { encoding: 'utf8', windowsHide: true });
if (rustInfo.error || rustInfo.status !== 0) {
	process.stderr.write(
		'Rust is required to build Agent Burn. Install the pinned toolchain with rustup.\n',
	);
	process.exit(1);
}
const target =
	process.env.TAURI_ENV_TARGET_TRIPLE ??
	process.env.CARGO_BUILD_TARGET ??
	rustInfo.stdout.match(/^host: (.+)$/m)?.[1];
const plan = nativeBuildPlan(target ?? 'unknown');
const result = spawnSync('cargo', plan.cargoArgs, {
	cwd: repoRoot,
	stdio: 'inherit',
	windowsHide: true,
});
if (result.error || result.status !== 0) {
	process.stderr.write('The bundled Agent Burn CLI could not be built.\n');
	process.exit(result.status ?? 1);
}
const binaries = join(appRoot, 'src-tauri', 'binaries');
mkdirSync(binaries, { recursive: true });
copyFileSync(
	join(repoRoot, 'rust', 'target', plan.target, 'release', plan.binaryName),
	join(binaries, plan.stagedName),
);
process.stdout.write(`Bundled CLI ready for ${plan.target}.\n`);
