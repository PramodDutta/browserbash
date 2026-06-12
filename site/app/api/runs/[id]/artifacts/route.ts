import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { sql } from '@/lib/db';
import { hashApiKey, bearerFrom } from '@/lib/apikeys';

const KINDS = {
    screenshot: { column: 'screenshot_url', ext: 'png', contentType: 'image/png', max: 8_000_000 },
    video: { column: 'video_url', ext: 'webm', contentType: 'video/webm', max: 60_000_000 },
    trace: { column: 'trace_url', ext: 'zip', contentType: 'application/zip', max: 60_000_000 },
} as const;

type Kind = keyof typeof KINDS;

/** CLI uploads a recorded artifact for one of its own runs. Bearer-authed. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    const key = bearerFrom(req.headers.get('authorization'));
    if (!key) return NextResponse.json({ error: 'Missing Bearer bb_… key' }, { status: 401 });

    const owners = (await sql()`
        SELECT user_id, (expires_at IS NOT NULL AND expires_at <= now()) AS expired
        FROM api_keys WHERE key_hash = ${hashApiKey(key)}`) as Array<{ user_id: string; expired: boolean }>;
    if (owners.length === 0) return NextResponse.json({ error: 'Unknown or revoked key' }, { status: 401 });
    if (owners[0].expired) return NextResponse.json({ error: 'API key expired' }, { status: 401 });
    const userId = owners[0].user_id;

    const { id } = await ctx.params;
    const runId = Number(id);
    if (!Number.isInteger(runId)) return NextResponse.json({ error: 'Bad run id' }, { status: 400 });

    const kind = req.nextUrl.searchParams.get('kind') as Kind | null;
    if (!kind || !(kind in KINDS)) {
        return NextResponse.json({ error: 'kind must be screenshot | video | trace' }, { status: 400 });
    }
    const spec = KINDS[kind];

    // The run must exist and belong to this key's user.
    const own = (await sql()`SELECT id FROM runs WHERE id = ${runId} AND user_id = ${userId}`) as Array<{ id: number }>;
    if (own.length === 0) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

    const body = await req.arrayBuffer();
    if (body.byteLength === 0) return NextResponse.json({ error: 'Empty body' }, { status: 400 });
    if (body.byteLength > spec.max) return NextResponse.json({ error: `${kind} too large` }, { status: 413 });

    let url: string;
    try {
        const blob = await put(`runs/${userId}/${runId}/${kind}.${spec.ext}`, Buffer.from(body), {
            access: 'public',
            contentType: spec.contentType,
            addRandomSuffix: false,
            allowOverwrite: true,
        });
        url = blob.url;
    } catch (err) {
        console.error('blob put failed:', err);
        return NextResponse.json({ error: 'Storage upload failed' }, { status: 503 });
    }

    // Fixed column per kind — tagged templates only, no dynamic SQL.
    const db = sql();
    if (kind === 'screenshot') {
        await db`UPDATE runs SET screenshot_url = ${url} WHERE id = ${runId} AND user_id = ${userId}`;
    } else if (kind === 'video') {
        await db`UPDATE runs SET video_url = ${url} WHERE id = ${runId} AND user_id = ${userId}`;
    } else {
        await db`UPDATE runs SET trace_url = ${url} WHERE id = ${runId} AND user_id = ${userId}`;
    }

    return NextResponse.json({ ok: true, url });
}
