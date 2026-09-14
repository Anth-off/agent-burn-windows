import type { ReportEnvelope } from './contracts.ts';

interface ReportRequest {
	cached: Promise<ReportEnvelope | null>;
	fresh: Promise<ReportEnvelope>;
	currentUpdatedAt?: number;
	onReport: (report: ReportEnvelope) => void;
	onError: (error: unknown) => void;
	onSettled: () => void;
}

export function loadReportWithCache(request: ReportRequest) {
	let active = true;
	let refreshed = false;
	let refreshSettled = false;
	void request.cached
		.then((envelope) => {
			if (
				active &&
				envelope &&
				!refreshed &&
				envelope.updatedAt >= (request.currentUpdatedAt ?? 0)
			) {
				request.onReport(envelope);
				if (!refreshSettled && envelope.error) request.onError(envelope.error);
			}
		})
		.catch(() => undefined);
	void request.fresh
		.then((envelope) => {
			if (!active) return;
			refreshSettled = true;
			if (envelope.report == null) {
				throw new Error(
					envelope.error ??
						'Aucun rapport disponible. Lancez une session de votre agent, puis actualisez.',
				);
			}
			request.onReport(envelope);
			refreshed = true;
			request.onError(envelope.error);
		})
		.catch((error: unknown) => {
			refreshSettled = true;
			if (active) request.onError(error);
		})
		.finally(() => {
			if (active) request.onSettled();
		});
	return () => {
		active = false;
	};
}
