/**
 * Per-IP sliding-window throttle. In-memory, so it only bounds a single
 * serverless instance — fine as a first layer on top of the honeypot and
 * the unique-email constraint.
 */
const hits = new Map<string, number[]>();

export function throttled(ip: string, limit = 5, windowMs = 60_000): boolean {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
        hits.set(ip, recent);
        return true;
    }
    recent.push(now);
    hits.set(ip, recent);
    return false;
}
