import { NextRequest, NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { sql } from '@/lib/db';
import { ONBOARDING_STEPS } from '@/lib/onboarding-steps';

const VALID_STEPS = new Set(ONBOARDING_STEPS.map((s) => s.id));

export async function GET(): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = (await sql()`SELECT step FROM onboarding WHERE user_id = ${user.id}`) as Array<{ step: string }>;
    return NextResponse.json({ done: rows.map((r) => r.step) });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: { step?: string; done?: boolean };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    if (!body.step || !VALID_STEPS.has(body.step)) {
        return NextResponse.json({ error: 'Unknown step' }, { status: 400 });
    }

    if (body.done === false) {
        await sql()`DELETE FROM onboarding WHERE user_id = ${user.id} AND step = ${body.step}`;
    } else {
        await sql()`
            INSERT INTO onboarding (user_id, step) VALUES (${user.id}, ${body.step})
            ON CONFLICT (user_id, step) DO NOTHING`;
    }
    const rows = (await sql()`SELECT step FROM onboarding WHERE user_id = ${user.id}`) as Array<{ step: string }>;
    return NextResponse.json({ done: rows.map((r) => r.step) });
}
