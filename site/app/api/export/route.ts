import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { isAdmin } from '@/lib/admin';

export async function GET(): Promise<NextResponse | Response> {
    if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
        return NextResponse.json({ error: 'Not configured' }, { status: 404 });
    }
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress;
    if (!isAdmin(email)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = (await sql()`
        SELECT id, email, name, use_case, source, created_at
        FROM waitlist ORDER BY id`) as Array<Record<string, unknown>>;

    const esc = (v: unknown): string => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'id,email,name,use_case,source,created_at';
    const csv = [header, ...rows.map((r) => [r.id, r.email, r.name, r.use_case, r.source, r.created_at].map(esc).join(','))].join('\n');

    return new Response(csv, {
        headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="browserbash-waitlist.csv"',
        },
    });
}
