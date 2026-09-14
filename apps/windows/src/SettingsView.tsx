import { useState } from 'react';
import type { FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowLeft, FolderOpen, Save } from 'lucide-react';
import type { Settings } from './contracts.ts';
import { errorMessage } from './use-usage.ts';

export function SettingsView({
	settings,
	native,
	onSave,
	onClose,
}: {
	settings: Settings;
	native: boolean;
	onSave: (settings: Settings) => Promise<void>;
	onClose: () => void;
}) {
	const [draft, setDraft] = useState<Settings>({ ...settings });
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
		setDraft((current) => ({ ...current, [key]: value }));
		setMessage(null);
	};
	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setSaving(true);
		setError(null);
		setMessage(null);
		try {
			await onSave(draft);
			setMessage('Réglages enregistrés.');
		} catch (reason) {
			setError(errorMessage(reason));
		} finally {
			setSaving(false);
		}
	}
	async function openFolder() {
		try {
			await invoke('open_data_folder');
		} catch (reason) {
			setError(errorMessage(reason));
		}
	}

	return (
		<main className="main settings-view" id="main-content">
			<button className="back-button" type="button" onClick={onClose}>
				<ArrowLeft size={16} aria-hidden="true" /> Retour au tableau de bord
			</button>
			<header className="page-heading">
				<div>
					<h1>Réglages</h1>
					<p>Votre application, vos sources de données.</p>
				</div>
			</header>
			{!native && (
				<div className="notice" role="status">
					Aperçu navigateur : les réglages s’enregistrent dans l’application Windows.
				</div>
			)}
			<form onSubmit={submit}>
				<fieldset disabled={saving}>
					<section className="settings-section" aria-labelledby="appearance-title">
						<h2 id="appearance-title">Apparence</h2>
						<div className="setting-row">
							<label htmlFor="theme">
								Thème<span>Suivre Windows ou choisir une apparence.</span>
							</label>
							<select
								id="theme"
								value={draft.theme}
								onChange={(event) => {
									const value = event.target.value;
									if (value === 'system' || value === 'light' || value === 'dark')
										change('theme', value);
								}}
							>
								<option value="system">Système</option>
								<option value="light">Clair</option>
								<option value="dark">Sombre</option>
							</select>
						</div>
					</section>
					<section className="settings-section" aria-labelledby="background-title">
						<h2 id="background-title">Fonctionnement</h2>
						<div className="setting-row">
							<label htmlFor="refresh-minutes">
								Actualisation automatique
								<span>Le suivi continue lorsque la fenêtre est masquée.</span>
							</label>
							<select
								id="refresh-minutes"
								value={draft.refreshMinutes}
								onChange={(event) => change('refreshMinutes', Number(event.target.value))}
							>
								{[1, 2, 5, 10, 15, 30, 60].map((value) => (
									<option key={value} value={value}>
										Toutes les {value} min
									</option>
								))}
							</select>
						</div>
						<div className="setting-row">
							<label htmlFor="launch-login">
								Ouvrir au démarrage de Windows
								<span>Lancer Agent Burn à l’ouverture de votre session.</span>
							</label>
							<input
								id="launch-login"
								type="checkbox"
								role="switch"
								checked={draft.launchAtLogin}
								onChange={(event) => change('launchAtLogin', event.target.checked)}
							/>
						</div>
						<div className="setting-row">
							<label htmlFor="close-tray">
								Garder l’application dans la zone de notification
								<span>Fermer la fenêtre conserve le suivi près de l’horloge.</span>
							</label>
							<input
								id="close-tray"
								type="checkbox"
								role="switch"
								checked={draft.closeToTray}
								onChange={(event) => change('closeToTray', event.target.checked)}
							/>
						</div>
						<div className="setting-row">
							<label htmlFor="quota-source">
								Quota dans la zone de notification
								<span>Source utilisée pour le relevé près de l’horloge.</span>
							</label>
							<select
								id="quota-source"
								value={draft.quotaSource}
								onChange={(event) => {
									const value = event.target.value;
									if (value === 'codex' || value === 'claude' || value === 'cursor')
										change('quotaSource', value);
								}}
							>
								<option value="codex">Codex</option>
								<option value="claude">Claude</option>
								<option value="cursor">Cursor</option>
							</select>
						</div>
						<div className="setting-row">
							<label htmlFor="offline">
								Mode hors ligne
								<span>Lire les journaux et le cache sans interroger les fournisseurs.</span>
							</label>
							<input
								id="offline"
								type="checkbox"
								role="switch"
								checked={draft.offline}
								onChange={(event) => change('offline', event.target.checked)}
							/>
						</div>
					</section>
					<section className="settings-section" aria-labelledby="sources-title">
						<h2 id="sources-title">Sources locales</h2>
						<p className="section-description">
							Laissez les champs vides pour utiliser la détection automatique. Vous pouvez indiquer
							un chemin Windows ou un dossier WSL accessible depuis Windows.
						</p>
						<div className="path-field">
							<label htmlFor="codex-homes">Dossiers Codex</label>
							<input
								id="codex-homes"
								type="text"
								spellCheck={false}
								value={draft.codexHomes}
								placeholder="Détection automatique"
								onChange={(event) => change('codexHomes', event.target.value)}
								aria-describedby="codex-help"
							/>
							<p id="codex-help">
								Un dossier contenant les sessions Codex. Séparez plusieurs dossiers par une virgule.
							</p>
						</div>
						<div className="path-field">
							<label htmlFor="claude-dir">Dossiers de configuration Claude</label>
							<input
								id="claude-dir"
								type="text"
								spellCheck={false}
								value={draft.claudeConfigDir}
								placeholder="Détection automatique"
								onChange={(event) => change('claudeConfigDir', event.target.value)}
								aria-describedby="claude-help"
							/>
							<p id="claude-help">Séparez plusieurs dossiers par une virgule.</p>
						</div>
						<div className="path-field">
							<label htmlFor="cursor-dir">Dossier de données Cursor</label>
							<input
								id="cursor-dir"
								type="text"
								spellCheck={false}
								value={draft.cursorDataDir}
								placeholder="Détection automatique"
								onChange={(event) => change('cursorDataDir', event.target.value)}
							/>
						</div>
					</section>
				</fieldset>
				<section className="settings-section privacy-section">
					<h2>Données de l’application</h2>
					<p>
						Les relevés et les réglages sont conservés sur cet ordinateur. En mode connecté, le
						moteur peut interroger les fournisseurs pour les tarifs et les quotas.
					</p>
					<button
						type="button"
						className="secondary-button"
						disabled={!native || saving}
						onClick={() => void openFolder()}
					>
						<FolderOpen size={16} aria-hidden="true" /> Ouvrir le dossier de données
					</button>
				</section>
				<div className="settings-footer">
					<div aria-live="polite">
						{message && <p className="success-message">{message}</p>}
						{error && (
							<p className="inline-error" role="alert">
								{error}
							</p>
						)}
					</div>
					<button type="button" className="secondary-button" onClick={onClose} disabled={saving}>
						Fermer
					</button>
					<button type="submit" className="primary-button" disabled={!native || saving}>
						<Save size={16} aria-hidden="true" />
						{saving ? 'Enregistrement…' : 'Enregistrer'}
					</button>
				</div>
			</form>
		</main>
	);
}
