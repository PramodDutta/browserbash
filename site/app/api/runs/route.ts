import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { hashApiKey, bearerFrom } from '@/lib/apikeys';

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
    const owners = (await sql()`SELECT user_id FROM api_keys WHERE key_hash = ${hash}`) as Array<{ user_id: string }>;
    if (owners.length === 0) return NextResponse.json({ error: 'Unknown or revoked key' }, { status: 401 });
    const userId = owners[0].user_id;

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

    const inserted = (await sql()`
        INSERT INTO runs (user_id, objective, status, duration_ms, steps_executed, provider, model, final_state, cli_version)
        VALUES (${userId}, ${r.objective}, ${r.status}, ${r.duration_ms}, ${r.steps_executed},
                ${r.provider ?? null}, ${r.model ?? null}, ${JSON.stringify(r.final_state ?? {})}::jsonb, ${r.cli_version ?? null})
        RETURNING id`) as Array<{ id: number }>;
    await sql()`UPDATE api_keys SET last_used_at = now(), cli_version = ${r.cli_version ?? null} WHERE key_hash = ${hash}`;

    return NextResponse.json({ ok: true, runId: inserted[0]?.id });
}

/** Dashboard list — authenticated by Clerk session, returns only the caller's runs. */
export async function GET(): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = (await sql()`
        SELECT id, objective, status, duration_ms, steps_executed, provider, model, final_state, cli_version,
               screenshot_url, video_url, trace_url,
               to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created_at
        FROM runs WHERE user_id = ${user.id} ORDER BY id DESC LIMIT 100`) as Array<Record<string, unknown>>;

    return NextResponse.json({ runs: rows });
}
