import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { hashApiKey, bearerFrom } from '@/lib/apikeys';
import { getPlan, runExpiry } from '@/lib/plans';

const RunInput = z.object({
    objective: z.string().trim().min(1).max(2000),
    status: z.enum(['passed', 'failed', 'error', 'timeout']),
    duration_ms: z.number().int().min(0).max(86_400_000),
    steps_executed: z.number().int().min(0).max(10_000),
    provider: z.string().max(40).optional(),
    model: z.string().max(120).optional(),
    final_state: z.record(z.string(), z.string()).optional(),
    cli_version: z.string().max(20).optional(),
});

/** CLI ingest — authenticated by API key, never by browser session. */
export async function POST(req: NextRequest): Promise<NextResponse> {
    const key = bearerFrom(req.headers.get('authorization'));
    if (!key) return NextResponse.json({ error: 'Missing Bearer bb_… key' }, { status: 401 });

    const hash = hashApiKey(key);
    const owners = (await sql()`
        SELECT user_id, (expires_at IS NOT NULL AND expires_at <= now()) AS expired
        FROM api_keys WHERE key_hash = ${hash}`) as Array<{ user_id: string; expired: boolean }>;
    if (owners.length === 0) return NextResponse.json({ error: 'Unknown or revoked key' }, { status: 401 });
    if (owners[0].expired) {
        return NextResponse.json({ error: 'API key expired — generate a fresh one at browserbash.com/dashboard and run: browserbash connect --key bb_…' }, { status: 401 });
    }
    const userId = owners[0].user_id;

    // Light per-key rate cap: protects the DB without getting in a real user's way.
    const [{ recent }] = (await sql()`
        SELECT COUNT(*)::int AS recent FROM runs
        WHERE user_id = ${userId} AND created_at > now() - interval '1 hour'`) as Array<{ recent: number }>;
    if (recent >= 300) {
        return NextResponse.json({ error: 'Rate limit: 300 runs/hour. Try again shortly.' }, { status: 429 });
    }

    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = RunInput.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid run' }, { status: 400 });
    }
    const r = parsed.data;

    // Free runs expire after the retention window; pro runs are kept forever.
    const expiresAt = runExpiry(await getPlan(userId));

    const inserted = (await sql()`
        INSERT INTO runs (user_id, objective, status, duration_ms, steps_executed, provider, model, final_state, cli_version, expires_at)
        VALUES (${userId}, ${r.objective}, ${r.status}, ${r.duration_ms}, ${r.steps_executed},
                ${r.provider ?? null}, ${r.model ?? null}, ${JSON.stringify(r.final_state ?? {})}::jsonb, ${r.cli_version ?? null}, ${expiresAt})
        RETURNING id`) as Array<{ id: number }>;
    await sql()`UPDATE api_keys SET last_used_at = now(), cli_version = ${r.cli_version ?? null} WHERE key_hash = ${hash}`;

    return NextResponse.json({ ok: true, runId: inserted[0]?.id });
}

/** Dashboard list — authenticated by Clerk session, returns only the caller's runs. */
export async function GET(): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Hide already-expired runs immediately (the cron hard-deletes them daily).
    const rows = (await sql()`
        SELECT id, objective, status, duration_ms, steps_executed, provider, model, final_state, cli_version,
               screenshot_url, video_url, trace_url,
               to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at,
               to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
               CASE WHEN expires_at IS NULL THEN NULL
                    ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - now())) / 86400))::int END AS days_left
        FROM runs
        WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > now())
        ORDER BY id DESC LIMIT 100`) as Array<Record<string, unknown>>;

    return NextResponse.json({ runs: rows });
}
