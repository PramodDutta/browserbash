import { NextRequest, NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Daily retention sweep (Vercel Cron — see vercel.json). Hard-deletes expired
 * runs for free users and best-effort removes their blob artifacts. Pro users
 * (a row in `plans` with plan='pro') are exempt; their runs have a NULL
 * expires_at and are never collected here.
 *
 * Guarded by CRON_SECRET when set: Vercel attaches `Authorization: Bearer
 * <CRON_SECRET>` to cron invocations. Deleting already-expired free data is
 * low-risk, so the route still runs if no secret is configured.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Collect artifact URLs before deletion so we can clean up Blob storage.
    const expired = (await sql()`
        SELECT id, screenshot_url, video_url, trace_url
        FROM runs
        WHERE expires_at IS NOT NULL AND expires_at <= now()
          AND user_id NOT IN (SELECT user_id FROM plans WHERE plan = 'pro')
        LIMIT 1000`) as Array<{
        id: number;
        screenshot_url: string | null;
        video_url: string | null;
        trace_url: string | null;
    }>;

    const urls = expired.flatMap((r) => [r.screenshot_url, r.video_url, r.trace_url].filter(Boolean) as string[]);
    for (const url of urls) {
        await del(url).catch(() => undefined); // best-effort; orphaned blobs are harmless
    }

    // Hard-delete by the same predicate (idempotent even if rows changed since the select).
    await sql()`
        DELETE FROM runs
        WHERE expires_at IS NOT NULL AND expires_at <= now()
          AND user_id NOT IN (SELECT user_id FROM plans WHERE plan = 'pro')`;

    return NextResponse.json({ ok: true, runsDeleted: expired.length, blobsDeleted: urls.length });
}
