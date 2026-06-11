import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(): Promise<NextResponse> {
    try {
        const rows = (await sql()`SELECT COUNT(*)::int AS count FROM waitlist`) as Array<{ count: number }>;
        return NextResponse.json(
            { count: rows[0]?.count ?? 0 },
            { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
        );
    } catch {
        // Counter simply hides itself client-side when count is null.
        return NextResponse.json({ count: null });
    }
}
