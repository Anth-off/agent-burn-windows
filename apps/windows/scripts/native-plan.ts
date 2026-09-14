export function nativeBuildPlan(target: string) {
	if (!['x86_64-pc-windows-msvc', 'aarch64-pc-windows-msvc'].includes(target)) {
		throw new Error(`Unsupported target ${target}: a Windows MSVC target is required.`);
	}
	return {
		target,
		binaryName: 'agent-burn.exe',
		stagedName: `agent-burn-${target}.exe`,
		cargoArgs: [
			'build',
			'--manifest-path',
			'rust/Cargo.toml',
			'--locked',
			'--release',
			'--bin',
			'agent-burn',
			'--target',
			target,
		],
	};
}
