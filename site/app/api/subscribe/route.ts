import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { throttled } from '@/lib/throttle';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Site-wide email capture (footer "Get the AI-testing playbook" box).
 * No sending yet — this endpoint just builds the list. Honeypot field
 * (`company`) + per-IP throttle are the only bot defenses; no CAPTCHA
 * for a free lead magnet.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
    let body: { email?: string; company?: string; source?: string };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.company) {
        // Honeypot tripped — pretend success so bots don't learn to skip it.
        return NextResponse.json({ ok: true });
    }

    const email = (body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
        return NextResponse.json({ error: 'Enter a valid email' }, { status: 400 });
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (throttled(ip, 5, 60_000)) {
        return NextResponse.json({ error: 'Too many requests, try again shortly' }, { status: 429 });
    }

    const source = typeof body.source === 'string' ? body.source.slice(0, 40) : 'footer';
    await sql()`
        INSERT INTO subscribers (email, source) VALUES (${email}, ${source})
        ON CONFLICT (email) DO NOTHING`;

    return NextResponse.json({ ok: true });
}
