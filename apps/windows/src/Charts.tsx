import { useMemo, useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import { chartDays, recordedQuotaPoints } from './chart-data.ts';
import type { HistoryPoint } from './contracts.ts';
import type { DailyUsage, Quota } from './report.ts';
import { dayLabel, money, percent, timeLabel, tokens } from './format.ts';

export function ActivityChart({
	days,
	source,
	loading,
}: {
	days: DailyUsage[];
	source: string;
	loading: boolean;
}) {
	const [metric, setMetric] = useState<'cost' | 'tokens'>('cost');
	const [hoveredDate, setHoveredDate] = useState<string | null>(null);
	const points = useMemo(() => chartDays(days), [days]);
	const tokensAvailable = points.some((point) => point.tokens !== null);
	const useTokens = metric === 'tokens' && tokensAvailable;
	const maximum = Math.max(
		...points.map((point) => (useTokens ? (point.tokens ?? 0) : point.cost)),
		0,
	);
	const first = points[0];
	const last = points.at(-1);
	const rangeDays = first && last ? (last.at - first.at) / 86400000 + 1 : 1;
	const barWidth = Math.max(0.7, Math.min(22, (608 / rangeDays) * 0.72));
	const hovered = points.find((point) => point.date === hoveredDate);
	const format = useTokens ? tokens : money;

	return (
		<section className="panel activity-panel" aria-labelledby="activity-title">
			<div className="section-heading">
				<h2 id="activity-title">Activité quotidienne</h2>
				<div className="segmented small" aria-label="Mesure du graphique">
					<button type="button" aria-pressed={!useTokens} onClick={() => setMetric('cost')}>
						Valeur API
					</button>
					<button
						type="button"
						aria-pressed={useTokens}
						disabled={!tokensAvailable}
						title={
							!tokensAvailable
								? 'Les tokens par jour ne sont pas disponibles dans ce rapport.'
								: undefined
						}
						onClick={() => setMetric('tokens')}
					>
						Tokens
					</button>
				</div>
			</div>
			{points.length > 0 && maximum > 0 && first && last ? (
				<>
					<div className="chart-caption">
						{hovered ? (
							<>
								<strong>{format(useTokens ? (hovered.tokens ?? 0) : hovered.cost)}</strong>
								<span>{dayLabel(hovered.date)}</span>
							</>
						) : (
							<span>
								{dayLabel(first.date)} — {dayLabel(last.date)}
							</span>
						)}
					</div>
					<svg
						className={`activity-chart source-${source}`}
						viewBox="0 0 680 210"
						role="img"
						aria-label={`Activité quotidienne, ${useTokens ? 'tokens' : 'valeur en dollars'}. Les valeurs détaillées sont disponibles sous le graphique.`}
						onMouseLeave={() => setHoveredDate(null)}
					>
						{[0, 0.5, 1].map((fraction) => (
							<g key={fraction}>
								<line
									x1="58"
									x2="667"
									y1={173 - fraction * 142}
									y2={173 - fraction * 142}
									className="chart-grid"
								/>
								<text x="48" y={177 - fraction * 142} textAnchor="end" className="chart-label">
									{format(maximum * fraction)}
								</text>
							</g>
						))}
						{points.map((point) => {
							const value = useTokens ? (point.tokens ?? 0) : point.cost;
							const height = (value / maximum) * 142;
							const x = 58 + (((point.at - first.at) / 86400000 + 0.5) / rangeDays) * 608;
							return (
								<rect
									key={point.date}
									x={x - barWidth / 2}
									y={173 - height}
									width={barWidth}
									height={height}
									rx={Math.min(2, barWidth / 2)}
									className={`chart-bar ${hoveredDate === point.date ? 'is-hovered' : ''}`}
									onMouseEnter={() => setHoveredDate(point.date)}
								>
									<title>
										{dayLabel(point.date)} : {format(value)}
									</title>
								</rect>
							);
						})}
						<text x="58" y="201" className="chart-label">
							{dayLabel(first.date)}
						</text>
						{first.date !== last.date && (
							<text x="667" y="201" textAnchor="end" className="chart-label">
								{dayLabel(last.date)}
							</text>
						)}
					</svg>
					<details className="chart-details">
						<summary>Voir les valeurs par jour</summary>
						<div className="table-scroll daily-table">
							<table>
								<thead>
									<tr>
										<th scope="col">Date</th>
										<th scope="col">Tokens</th>
										<th scope="col">Valeur API</th>
									</tr>
								</thead>
								<tbody>
									{points.map((point) => (
										<tr key={point.date}>
											<th scope="row">{point.date}</th>
											<td>{tokens(point.tokens)}</td>
											<td>{money(point.cost)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</details>
				</>
			) : (
				<div className="chart-empty">
					<BarChart3 size={28} strokeWidth={1.3} aria-hidden="true" />
					<strong>
						{loading
							? 'Lecture de votre activité…'
							: points.length
								? 'Aucune valeur sur cette période'
								: 'Votre activité apparaîtra ici'}
					</strong>
					<p>
						{loading
							? 'Le premier chargement peut prendre un moment.'
							: 'Lancez une session de votre agent ou choisissez une période plus longue.'}
					</p>
				</div>
			)}
		</section>
	);
}

export function QuotaPanel({
	quota,
	history,
	source,
	updatedAt,
	cached,
	error,
}: {
	quota: Quota | null;
	history: HistoryPoint[];
	source: string;
	updatedAt: number | null;
	cached: boolean;
	error: string | null;
}) {
	const points = useMemo(() => recordedQuotaPoints(history, source).slice(-500), [history, source]);
	const first = points[0];
	const last = points.at(-1);
	const resetAt =
		quota?.endsAt ??
		(quota && updatedAt && quota.windowMinutes !== null && quota.elapsedPercent !== null
			? updatedAt + quota.windowMinutes * 60000 * (1 - quota.elapsedPercent / 100)
			: null);
	return (
		<section className={`panel quota-panel source-${source}`} aria-labelledby="quota-title">
			<div className="section-heading">
				<h2 id="quota-title">
					{quota?.kind === 'credits' ? 'Crédits disponibles' : 'Limite d’abonnement'}
				</h2>
				<span className="muted">
					{quota
						? cached
							? 'Relevé enregistré'
							: quota.live
								? 'Quota détecté'
								: 'Estimation du moteur'
						: 'Indisponible'}
				</span>
			</div>
			{quota ? (
				<div className="quota-content">
					<div className="quota-reading">
						<div className="quota-number">
							{percent(100 - quota.usedPercent)}
							<span>restants</span>
						</div>
						<div
							className="meter"
							role="meter"
							aria-label="Quota utilisé"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={quota.usedPercent}
						>
							<span style={{ width: `${quota.usedPercent}%` }} />
						</div>
						<div className="quota-meta">
							<span>{percent(quota.usedPercent)} utilisés</span>
							<span>
								{quota.kind === 'credits'
									? 'Crédits actifs'
									: quota.kind === 'cycle'
										? 'Cycle de facturation'
										: `Fenêtre de ${Math.round((quota.windowMinutes ?? 0) / 60)} h`}
							</span>
						</div>
						{updatedAt && <p>Relevé du {timeLabel(updatedAt)}.</p>}
						{resetAt && (
							<p>
								{quota.kind === 'credits'
									? 'Première expiration de crédits'
									: quota.kind === 'cycle'
										? 'Fin du cycle de facturation'
										: 'Remise à zéro estimée'}{' '}
								: {timeLabel(resetAt)}.
							</p>
						)}
					</div>
					<div className="quota-history">
						{first && last ? (
							<>
								<svg
									viewBox="0 0 460 130"
									role="img"
									aria-label={`${points.length} mesures enregistrées du quota restant. Les points sont des relevés indépendants.`}
								>
									{[0, 50, 100].map((value) => (
										<g key={value}>
											<line
												x1="35"
												x2="449"
												y1={100 - value * 0.8}
												y2={100 - value * 0.8}
												className="chart-grid"
											/>
											<text x="27" y={104 - value * 0.8} textAnchor="end" className="chart-label">
												{value}%
											</text>
										</g>
									))}
									{points.map((point, index) => (
										<circle
											key={`${point.at}:${index}`}
											cx={
												first.at === last.at
													? 242
													: 40 + ((point.at - first.at) / (last.at - first.at)) * 400
											}
											cy={100 - (100 - point.usedPercent) * 0.8}
											r="2.8"
											className="quota-point"
										>
											<title>
												{timeLabel(point.at)} : {percent(100 - point.usedPercent)} restants
											</title>
										</circle>
									))}
									<text x="35" y="125" className="chart-label">
										{timeLabel(first.at)}
									</text>
									<text x="449" y="125" textAnchor="end" className="chart-label">
										{timeLabel(last.at)}
									</text>
								</svg>
								<p className="muted">{points.length} relevés enregistrés · aucun point interpolé</p>
							</>
						) : (
							<p className="muted">L’historique se construira au fil des actualisations.</p>
						)}
					</div>
				</div>
			) : (
				<div className="quota-unavailable">
					<Info size={20} aria-hidden="true" />
					<div>
						<strong>
							Aucun quota exploitable pour{' '}
							{source === 'cursor' ? 'Cursor' : source === 'codex' ? 'Codex' : 'Claude'}.
						</strong>
						<p>
							{source === 'cursor'
								? 'Les journaux Cursor donnent l’activité, sans garantir l’accès à une limite d’abonnement.'
								: 'Connectez-vous à votre agent et lancez une session. Les limites disponibles dans les journaux ou auprès du fournisseur apparaîtront ici.'}
						</p>
					</div>
				</div>
			)}
			{error && (
				<p className="inline-error" role="status">
					{error}
				</p>
			)}
		</section>
	);
}
