/**
 * Outbound webhook notifications (--notify <url>). Fire-and-forget with a
 * short timeout: a dead webhook must never change a run's verdict or block
 * the process exit. Slack incoming-webhook URLs get Slack's {text} shape;
 * everything else gets the raw JSON payload.
 */

export interface NotifyPayload {
    event: 'suite_end' | 'monitor_change' | 'run_end';
    status: string;
    title: string;
    summary: string;
    /** Extra machine-readable fields (counts, durations, urls). */
    data?: Record<string, unknown>;
}

export function isSlackWebhook(url: string): boolean {
    return /^https:\/\/hooks\.slack\.com\//.test(url);
}

/** Render the body actually POSTed to the webhook. */
export function buildWebhookBody(url: string, payload: NotifyPayload): string {
    if (isSlackWebhook(url)) {
        const icon = payload.status === 'passed' ? ':white_check_mark:' : ':x:';
        const lines = [
            `${icon} *${payload.title}* — ${payload.status}`,
            payload.summary,
        ];
        return JSON.stringify({ text: lines.filter(Boolean).join('\n') });
    }
    return JSON.stringify(payload);
}

const NOTIFY_TIMEOUT_MS = 8000;

export async function sendNotification(
    url: string,
    payload: NotifyPayload,
    log: (msg: string) => void = () => {},
): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: buildWebhookBody(url, payload),
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
            log(`Notify: webhook responded ${res.status}`);
            return false;
        }
        return true;
    } catch (err) {
        log(`Notify: webhook unreachable (${(err as Error).message})`);
        return false;
    }
}
