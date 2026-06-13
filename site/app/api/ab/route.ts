import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Hero A/B beacon sink. Records impressions and cta_clicks per variant.
 * Best-effort: swallows all errors (including a missing ab_events table) so a
 * marketing experiment can never break the landing page.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = (await req.json().catch(() => ({}))) as { variant?: string; event?: string };
        const variant = body.variant === 'b' ? 'b' : 'a';
        const event = body.event === 'cta_click' ? 'cta_click' : 'impression';
        await sql()`INSERT INTO ab_events (variant, event) VALUES (${variant}, ${event})`;
    } catch {
        // table may not exist yet, or DB unavailable — ignore
    }
    return NextResponse.json({ ok: true });
}

/** Aggregate counts for quick inspection: GET /api/ab → { a:{impression,cta_click}, b:{...}, ctr }. */
export async function GET(): Promise<NextResponse> {
    try {
        const rows = (await sql()`
            SELECT variant, event, COUNT(*)::int AS n
            FROM ab_events GROUP BY variant, event`) as Array<{ variant: string; event: string; n: number }>;
        const out: Record<string, { impression: number; cta_click: number; ctr: number }> = {
            a: { impression: 0, cta_click: 0, ctr: 0 },
            b: { impression: 0, cta_click: 0, ctr: 0 },
        };
        for (const r of rows) {
            if ((r.variant === 'a' || r.variant === 'b') && (r.event === 'impression' || r.event === 'cta_click')) {
                out[r.variant][r.event] = r.n;
            }
        }
        for (const v of ['a', 'b'] as const) {
            out[v].ctr = out[v].impression ? Math.round((out[v].cta_click / out[v].impression) * 1000) / 10 : 0;
        }
        return NextResponse.json(out);
    } catch {
        return NextResponse.json({ error: 'ab_events not available' }, { status: 200 });
    }
}
