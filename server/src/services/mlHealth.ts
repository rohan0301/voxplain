/**
 * Liveness tracking for the Python ML service.
 *
 * Without this, the only way to learn that the ML service is down is to have a
 * user's analysis request fail against it, and the failure is invisible: the
 * request path catches the error and quietly returns a heuristic-only score on
 * a different scale. The service is one systemd unit on one EC2 box, so this
 * is a routine state, not an edge case.
 *
 * Polling lets the request path know the mode *before* it answers, and lets
 * "the service is down" be told apart from "the model is switched off", which
 * are different problems with different fixes.
 */

export type MlDegradation =
    | 'ml_service_unreachable'   // no answer from /health
    | 'model_disabled'           // service is up, LOAD_BERT_MODEL is false
    | 'model_failed_to_load';    // service is up, meant to load, didn't

export interface MlStatus {
    /** /health answered on the last poll. */
    reachable: boolean;
    /** The service is configured to load the model (LOAD_BERT_MODEL). */
    modelEnabled: boolean;
    /** Weights are in memory and /predict will answer. */
    modelLoaded: boolean;
    /** ms since epoch of the last completed poll, null before the first. */
    lastCheckedAt: number | null;
    /** Why the ML half is not fully available, empty when it is. */
    degraded: MlDegradation[];
}

const POLL_INTERVAL_MS = 60_000;
const POLL_TIMEOUT_MS = 5_000;

export const mlServiceUrl = (): string =>
    process.env.ML_SERVICE_URL || 'http://localhost:8000';

let status: MlStatus = {
    reachable: false,
    modelEnabled: false,
    modelLoaded: false,
    lastCheckedAt: null,
    degraded: ['ml_service_unreachable'],
};

export const getMlStatus = (): MlStatus => status;

/**
 * A request that just reached the ML service tells us more, and more recently,
 * than the poll does. Same for one that just failed against it.
 */
export const noteMlReachable = (reachable: boolean): void => {
    if (status.reachable === reachable) return;
    status = buildStatus(reachable, status.modelEnabled, status.modelLoaded);
};

function buildStatus(reachable: boolean, modelEnabled: boolean, modelLoaded: boolean): MlStatus {
    const degraded: MlDegradation[] = [];
    if (!reachable) {
        degraded.push('ml_service_unreachable');
    } else if (!modelEnabled) {
        degraded.push('model_disabled');
    } else if (!modelLoaded) {
        degraded.push('model_failed_to_load');
    }
    return {
        reachable,
        modelEnabled,
        modelLoaded,
        lastCheckedAt: Date.now(),
        degraded,
    };
}

async function pollOnce(): Promise<void> {
    try {
        const response = await fetch(`${mlServiceUrl()}/health`, {
            signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
        });
        if (!response.ok) {
            status = buildStatus(false, false, false);
            return;
        }
        const body = await response.json() as {
            status?: string;
            model_loaded?: boolean;
            // Added alongside this change; older deploys of the ML service do
            // not send it. Absent means "we cannot tell", and the safe read of
            // that is "not enabled" — it keeps us from claiming a model is
            // available when nothing has said so.
            model_enabled?: boolean;
        };
        status = buildStatus(true, body.model_enabled ?? false, body.model_loaded ?? false);
    } catch {
        status = buildStatus(false, false, false);
    }
}

let timer: NodeJS.Timeout | null = null;

/** Poll immediately, then every 60s. Safe to call once at startup. */
export function startMlHealthPolling(): void {
    if (timer) return;
    void pollOnce();
    timer = setInterval(() => { void pollOnce(); }, POLL_INTERVAL_MS);
    // Do not hold the process open on this alone.
    timer.unref?.();
}

export function stopMlHealthPolling(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
}
