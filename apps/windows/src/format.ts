const moneyFormat = new Intl.NumberFormat('fr-FR', {
	style: 'currency',
	currency: 'USD',
	maximumFractionDigits: 2,
});
const tokenFormat = new Intl.NumberFormat('fr-FR', {
	notation: 'compact',
	maximumFractionDigits: 1,
});
const numberFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const sourceNames: Record<string, string> = {
	codex: 'Codex',
	claude: 'Claude',
	cursor: 'Cursor',
	opencode: 'OpenCode',
	gemini: 'Gemini',
	amp: 'Amp',
	droid: 'Droid',
	pi: 'Pi',
	openclaw: 'OpenClaw',
	kimi: 'Kimi',
	qwen: 'Qwen',
};

export function money(value: number) {
	return moneyFormat.format(value);
}
export function tokens(value: number | null) {
	return value === null ? '—' : tokenFormat.format(value);
}
export function percent(value: number) {
	return `${numberFormat.format(value)} %`;
}
export function sourceName(source: string) {
	return sourceNames[source] ?? source;
}
export function dayLabel(date: string) {
	return new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
		timeZone: 'UTC',
	});
}
export function timeLabel(at: number) {
	return new Date(at).toLocaleString('fr-FR', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}
