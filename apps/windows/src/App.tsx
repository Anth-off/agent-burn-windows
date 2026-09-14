import { useState } from 'react';
import {
	BarChart3,
	RefreshCw,
	Settings2,
	ShieldCheck,
	Info,
	AlertCircle,
	WifiOff,
} from 'lucide-react';
import type { Period, Source } from './contracts.ts';
import { PERIODS, SOURCES } from './contracts.ts';
import { useUsage } from './use-usage.ts';
import { ActivityChart, QuotaPanel } from './Charts.tsx';
import { ModelTable, SourceIcon, SourceList } from './UsageTables.tsx';
import { SettingsView } from './SettingsView.tsx';
import { money, sourceName, timeLabel, tokens } from './format.ts';

export function App() {
	const [source, setSource] = useState<Source>('summary');
	const [period, setPeriod] = useState<Period>('month');
	const [showSettings, setShowSettings] = useState(false);
	const isHarness = source === 'codex' || source === 'claude';
	const usage = useUsage(source, isHarness ? 'month' : period);
	const report = usage.loaded?.report;
	const periodLabel = isHarness
		? '30 derniers jours'
		: PERIODS.find((item) => item.key === period)?.label;
	const activeSource = source === 'summary' ? 'summary' : source;
	function selectSource(next: Source) {
		setSource(next);
		setShowSettings(false);
	}

	return (
		<div className={`app-shell source-${activeSource}`}>
			<a className="skip-link" href="#main-content">
				Aller au contenu
			</a>
			<header className="app-toolbar">
				<a
					className="app-brand"
					href="#main-content"
					onClick={() => {
						setShowSettings(false);
					}}
					aria-label="Agent Burn, tableau de bord"
				>
					<img src="/agent-burn.png" width="33" height="33" alt="" />
					<span>Agent Burn</span>
				</a>
				<nav className="source-tabs" aria-label="Sources d’activité">
					{SOURCES.map((item) => (
						<button
							type="button"
							key={item.key}
							className={`source-tab source-${item.key}`}
							aria-current={!showSettings && source === item.key ? 'page' : undefined}
							onClick={() => selectSource(item.key)}
						>
							{item.key === 'summary' ? (
								<BarChart3 size={16} aria-hidden="true" />
							) : (
								<SourceIcon name={item.key} size={17} />
							)}
							<span>{item.label}</span>
						</button>
					))}
				</nav>
				<div className="toolbar-actions">
					<button
						type="button"
						className={`icon-button ${usage.loading ? 'is-refreshing' : ''}`}
						aria-label="Actualiser les données"
						title="Actualiser les données"
						disabled={usage.loading || !usage.native}
						onClick={usage.refresh}
					>
						<RefreshCw size={17} aria-hidden="true" />
					</button>
					<button
						type="button"
						className={`icon-button ${showSettings ? 'is-selected' : ''}`}
						aria-label="Réglages"
						title="Réglages"
						aria-pressed={showSettings}
						onClick={() => setShowSettings(!showSettings)}
					>
						<Settings2 size={18} aria-hidden="true" />
					</button>
				</div>
			</header>
			{showSettings ? (
				<SettingsView
					settings={usage.settings}
					native={usage.native}
					onSave={usage.saveSettings}
					onClose={() => setShowSettings(false)}
				/>
			) : (
				<main className="main dashboard" id="main-content" aria-busy={usage.loading}>
					<header className="page-heading">
						<div className="page-title">
							{source !== 'summary' && <SourceIcon name={source} size={40} />}
							<div>
								<h1>{source === 'summary' ? 'Toute votre activité' : sourceName(source)}</h1>
								<p>
									{report?.plan ? `${report.plan} · ` : ''}
									{periodLabel} · activité de vos agents
								</p>
							</div>
						</div>
						<div className="period-control">
							{isHarness ? (
								<span className="period-fixed">30 derniers jours</span>
							) : (
								<>
									<label className="sr-only" htmlFor="period">
										Période
									</label>
									<select
										id="period"
										value={period}
										onChange={(event) => {
											const item = PERIODS.find((option) => option.key === event.target.value);
											if (item) setPeriod(item.key);
										}}
									>
										{PERIODS.map((item) => (
											<option key={item.key} value={item.key}>
												{item.label}
											</option>
										))}
									</select>
								</>
							)}
						</div>
					</header>
					{!usage.native && (
						<div className="notice" role="status">
							<Info size={17} aria-hidden="true" />
							<span>
								Aperçu navigateur. Ouvrez l’application Windows pour lire vos données locales.
							</span>
						</div>
					)}
					{usage.settingsError && (
						<div className="notice warning" role="alert">
							<AlertCircle size={17} aria-hidden="true" />
							<span>{usage.settingsError}</span>
							<button type="button" onClick={() => setShowSettings(true)}>
								Vérifier les réglages
							</button>
						</div>
					)}
					{usage.error && (
						<div className="notice warning" role="alert">
							<AlertCircle size={17} aria-hidden="true" />
							<div>
								<strong>Actualisation impossible</strong>
								<span>{usage.error}</span>
								{report && <span>Le dernier relevé disponible reste affiché.</span>}
							</div>
							<button type="button" disabled={usage.loading} onClick={usage.refresh}>
								Réessayer
							</button>
						</div>
					)}
					{usage.settings.offline && (
						<div className="notice" role="status">
							<WifiOff size={17} aria-hidden="true" />
							<span>Mode hors ligne : journaux locaux et données déjà enregistrées.</span>
						</div>
					)}
					<section className="metrics-strip" aria-label="Synthèse de l’activité">
						<div className="metric">
							<h2>Équivalent API</h2>
							<strong>{report ? money(report.totalCost) : '—'}</strong>
							<p>Valeur estimée des tokens</p>
						</div>
						<div className="metric">
							<h2>Tokens traités</h2>
							<strong title={report?.totalTokens?.toLocaleString('fr-FR')}>
								{report ? tokens(report.totalTokens) : '—'}
							</strong>
							<p>
								{report && report.totalTokens === null
									? 'Total indisponible dans ce rapport'
									: 'Entrée, sortie et cache'}
							</p>
						</div>
						<div className="metric">
							<h2>
								{isHarness && report?.pricePerMonth != null
									? 'Abonnement mensuel'
									: isHarness
										? 'Modèles présentés'
										: 'Modèles utilisés'}
							</h2>
							<strong>
								{isHarness && report?.pricePerMonth != null
									? money(report.pricePerMonth)
									: report
										? report.models.length
										: '—'}
							</strong>
							<p>
								{isHarness && report?.pricePerMonth != null
									? (report.plan ?? 'Prix indiqué par le moteur')
									: report?.partialModels
										? 'Principaux modèles du rapport'
										: 'Sur la période sélectionnée'}
							</p>
						</div>
					</section>
					{source !== 'summary' && (
						<QuotaPanel
							quota={report?.quota ?? null}
							history={usage.history}
							source={source}
							updatedAt={usage.loaded?.updatedAt ?? null}
							cached={Boolean(usage.loaded?.cached || usage.error)}
							error={usage.historyError}
						/>
					)}
					<div className={`activity-layout ${source !== 'summary' ? 'single' : ''}`}>
						<ActivityChart days={report?.daily ?? []} source={source} loading={usage.loading} />
						{source === 'summary' && (
							<SourceList
								rows={report?.sources ?? []}
								totalCost={report?.totalCost ?? 0}
								onSelect={selectSource}
							/>
						)}
					</div>
					<ModelTable
						key={source}
						rows={report?.models ?? []}
						totalCost={report?.totalCost ?? 0}
						partial={report?.partialModels ?? isHarness}
					/>
					<p className="usage-explanation">
						<Info size={15} aria-hidden="true" />
						<span>
							L’équivalent API estime la valeur de votre activité aux tarifs API. Ce montant ne
							correspond pas à votre facture d’abonnement.
						</span>
					</p>
					{usage.native &&
						!usage.loading &&
						(!report || (report.sources.length === 0 && report.models.length === 0)) && (
							<button type="button" className="text-button" onClick={() => setShowSettings(true)}>
								Vérifier les dossiers de mes agents
							</button>
						)}
				</main>
			)}
			<footer className="app-footer">
				<div className="refresh-state" role="status">
					<span className={`status-dot ${usage.error ? 'warning' : usage.loaded ? 'ready' : ''}`} />
					{usage.loading
						? 'Actualisation en cours…'
						: usage.loaded
							? `${usage.loaded.cached || usage.error ? 'Relevé enregistré' : 'Mis à jour'} · ${timeLabel(usage.loaded.updatedAt)}`
							: usage.native
								? 'En attente de données'
								: 'Aperçu sans données'}
				</div>
				<span className="local-caption">
					<ShieldCheck size={13} aria-hidden="true" /> Données conservées localement
				</span>
				<span className="platform-caption">Windows</span>
			</footer>
		</div>
	);
}
