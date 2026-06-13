import { sql } from './db';

/** Free-plan cloud-run retention. After this many days a free user's runs are
 * deleted by the daily cleanup cron (and hidden from the dashboard immediately). */
export const RETENTION_DAYS = 15;

export type Plan = 'free' | 'pro';

/** A user's plan, keyed by Clerk user id. Absent row ⇒ free. */
export async function getPlan(userId: string): Promise<Plan> {
    const rows = (await sql()`SELECT plan FROM plans WHERE user_id = ${userId} LIMIT 1`) as Array<{ plan: string }>;
    return rows[0]?.plan === 'pro' ? 'pro' : 'free';
}

/** ISO expiry stamp for a new run: null for pro (kept forever), now+15d for free. */
export function runExpiry(plan: Plan): string | null {
    if (plan === 'pro') return null;
    return new Date(Date.now() + RETENTION_DAYS * 86_400_000).toISOString();
}
