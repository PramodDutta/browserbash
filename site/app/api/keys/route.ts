import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { generateApiKey, maskKey } from '@/lib/apikeys';

export async function GET(): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = (await sql()`
        SELECT key_hash, label, cli_version,
               to_char(created_at, 'YYYY-MM-DD') AS created_at,
               to_char(last_used_at, 'YYYY-MM-DD HH24:MI') AS last_used_at,
               to_char(expires_at, 'YYYY-MM-DD') AS expires_at,
               GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - now())) / 86400))::int AS days_left,
               (expires_at <= now()) AS expired
        FROM api_keys WHERE user_id = ${user.id} ORDER BY created_at DESC`) as Array<Record<string, unknown>>;

    return NextResponse.json({
        keys: rows.map((r) => ({
            id: maskKey(r.key_hash as string),
            label: r.label,
            cliVersion: r.cli_version,
            createdAt: r.created_at,
            lastUsedAt: r.last_used_at,
            expiresAt: r.expires_at,
            daysLeft: r.days_left,
            expired: r.expired,
        })),
    });
}

export async function POST(): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // One active key per user keeps the mental model simple: new key revokes old.
    // Keys are time-limited — they stop syncing after the window and the user
    // regenerates from the dashboard. 30 days mirrors common token norms.
    const { key, hash } = generateApiKey();
    await sql()`DELETE FROM api_keys WHERE user_id = ${user.id}`;
    await sql()`
        INSERT INTO api_keys (key_hash, user_id, expires_at)
        VALUES (${hash}, ${user.id}, now() + interval '30 days')`;

    return NextResponse.json({ key, shownOnce: true, expiresInDays: 30 });
}

export async function DELETE(): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    await sql()`DELETE FROM api_keys WHERE user_id = ${user.id}`;
    return NextResponse.json({ revoked: true });
}
