import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { WaitlistInput, addToWaitlist, type QueryFn } from '@/lib/waitlist';
import { throttled } from '@/lib/throttle';

export async function POST(req: NextRequest): Promise<NextResponse> {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (throttled(ip)) {
        return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 });
    }

    let raw: unknown;
    try {
        raw = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const parsed = WaitlistInput.safeParse(raw);
    if (!parsed.success) {
        const honeypot = (raw as Record<string, unknown>)?.website;
        if (typeof honeypot === 'string' && honeypot.length > 0) {
            // Bot filled the hidden field: pretend success, store nothing.
            return NextResponse.json({ position: 0, already: false });
        }
        return NextResponse.json(
            { error: parsed.error.issues[0]?.message ?? 'Invalid input.' },
            { status: 400 },
        );
    }

    try {
        const result = await addToWaitlist(sql() as unknown as QueryFn, parsed.data);
        return NextResponse.json(result);
    } catch (err) {
        console.error('waitlist insert failed:', err);
        return NextResponse.json({ error: 'Could not save right now — please retry.' }, { status: 503 });
    }
}
