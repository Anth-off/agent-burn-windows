import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, Cpu, ChevronRight } from 'lucide-react';
import type { Source } from './contracts.ts';
import type { UsageRow } from './report.ts';
import { money, percent, sourceName, tokens } from './format.ts';

const brandedSources = new Set([
	'codex',
	'claude',
	'cursor',
	'amp',
	'droid',
	'gemini',
	'kimi',
	'openclaw',
	'opencode',
	'pi',
	'qwen',
]);

export function SourceIcon({ name, size = 24 }: { name: string; size?: number }) {
	return brandedSources.has(name) ? (
		<img
			className={`source-icon source-icon-${name}`}
			src={`/brands/${name}.png`}
			width={size}
			height={size}
			alt=""
		/>
	) : (
		<Cpu size={size} aria-hidden="true" className="muted" />
	);
}

export function SourceList({
	rows,
	totalCost,
	onSelect,
}: {
	rows: UsageRow[];
	totalCost: number;
	onSelect: (source: Source) => void;
}) {
	return (
		<section className="panel sources-panel" aria-labelledby="source-title">
			<div className="section-heading">
				<h2 id="source-title">Par agent</h2>
				<span className="muted">{rows.length > 0 ? `${rows.length} actifs` : ''}</span>
			</div>
			{rows.length ? (
				<ul className="source-list">
					{rows.map((row) => {
						const known = row.name === 'codex' || row.name === 'claude' || row.name === 'cursor';
						const body = (
							<>
								<SourceIcon name={row.name} size={28} />
								<div className="source-row-content">
									<div>
										<strong>{sourceName(row.name)}</strong>
										<span>{money(row.cost)}</span>
									</div>
									<div className="source-row-caption">
										<span>{tokens(row.tokens)} tokens</span>
										<span>{totalCost > 0 ? percent((row.cost / totalCost) * 100) : ''}</span>
									</div>
									<div className="source-meter" aria-hidden="true">
										<span
											style={{
												width: `${totalCost > 0 ? Math.min(100, (row.cost / totalCost) * 100) : 0}%`,
											}}
										/>
									</div>
								</div>
								{known && <ChevronRight size={14} aria-hidden="true" className="muted" />}
							</>
						);
						return (
							<li key={row.name} className={`source-${row.name}`}>
								{known ? (
									<button
										type="button"
										className="source-row"
										onClick={() => {
											if (row.name === 'codex' || row.name === 'claude' || row.name === 'cursor')
												onSelect(row.name);
										}}
									>
										{body}
									</button>
								) : (
									<div className="source-row">{body}</div>
								)}
							</li>
						);
					})}
				</ul>
			) : (
				<div className="sources-empty">
					<p>Aucun agent détecté sur cette période.</p>
					<div className="known-sources">
						{['codex', 'claude', 'cursor'].map((name) => (
							<span key={name}>
								<SourceIcon name={name} size={22} />
								{sourceName(name)}
							</span>
						))}
					</div>
					<p>Les sources disponibles sont détectées à partir de vos journaux.</p>
				</div>
			)}
		</section>
	);
}

export function ModelTable({
	rows,
	totalCost,
	partial,
}: {
	rows: UsageRow[];
	totalCost: number;
	partial: boolean;
}) {
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<'name' | 'tokens' | 'cost'>('cost');
	const [ascending, setAscending] = useState(false);
	const sorted = useMemo(
		() =>
			rows
				.filter((row) => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
				.sort((a, b) => {
					const order = sort === 'name' ? a.name.localeCompare(b.name) : a[sort] - b[sort];
					return ascending ? order : -order;
				}),
		[rows, query, sort, ascending],
	);
	function changeSort(next: typeof sort) {
		setAscending(next === sort ? !ascending : next === 'name');
		setSort(next);
	}
	const columns = [
		{ key: 'name', label: 'Modèle' },
		{ key: 'tokens', label: 'Tokens' },
		{ key: 'cost', label: 'Valeur API' },
	] as const;
	return (
		<section className="panel model-panel" aria-labelledby="models-title">
			<div className="section-heading">
				<div className="heading-with-count">
					<h2 id="models-title">{partial ? 'Principaux modèles' : 'Détail des modèles'}</h2>
					<span className="count">{rows.length}</span>
				</div>
				<label className="search-field">
					<Search size={15} aria-hidden="true" />
					<span className="sr-only">Rechercher un modèle</span>
					<input
						type="search"
						placeholder="Rechercher un modèle"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
			</div>
			<div className="table-scroll">
				<table>
					<thead>
						<tr>
							{columns.map((column) => (
								<th
									key={column.key}
									scope="col"
									aria-sort={
										sort === column.key ? (ascending ? 'ascending' : 'descending') : 'none'
									}
								>
									<button
										type="button"
										className="sort-button"
										onClick={() => changeSort(column.key)}
									>
										{column.label}
										{sort === column.key &&
											(ascending ? (
												<ArrowUp size={12} aria-hidden="true" />
											) : (
												<ArrowDown size={12} aria-hidden="true" />
											))}
									</button>
								</th>
							))}
							<th scope="col" className="share-column">
								Part du total
							</th>
						</tr>
					</thead>
					<tbody>
						{sorted.map((row) => (
							<tr key={row.name}>
								<th scope="row" className="model-name" title={row.name}>
									{row.name}
								</th>
								<td title={row.tokens.toLocaleString('fr-FR')}>{tokens(row.tokens)}</td>
								<td>{money(row.cost)}</td>
								<td className="share-column">
									{totalCost > 0 ? percent((row.cost / totalCost) * 100) : '—'}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{sorted.length === 0 && (
				<div className="table-empty">
					{query
						? 'Aucun modèle ne correspond à votre recherche.'
						: 'Les modèles utilisés apparaîtront ici.'}
					{query && (
						<button type="button" onClick={() => setQuery('')}>
							Effacer la recherche
						</button>
					)}
				</div>
			)}
			{partial && rows.length > 0 && (
				<p className="table-note">
					Jusqu’aux six modèles principaux. Leur somme peut être inférieure au total.
				</p>
			)}
		</section>
	);
}
