#!/usr/bin/env node
// Creates the waitlist table. Usage: DATABASE_URL=... node scripts/db-init.mjs
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}

const sql = neon(url);

await sql`
    CREATE TABLE IF NOT EXISTS waitlist (
        id         SERIAL PRIMARY KEY,
        email      TEXT UNIQUE NOT NULL,
        name       TEXT,
        use_case   TEXT,
        source     TEXT DEFAULT 'landing',
        created_at TIMESTAMPTZ DEFAULT now()
    )`;

await sql`
    CREATE TABLE IF NOT EXISTS onboarding (
        user_id      TEXT NOT NULL,
        step         TEXT NOT NULL,
        completed_at TIMESTAMPTZ DEFAULT now(),
        PRIMARY KEY (user_id, step)
    )`;

const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM waitlist`;
const [{ ob }] = await sql`SELECT COUNT(*)::int AS ob FROM onboarding`;
console.log(`waitlist table ready — ${count} rows · onboarding table ready — ${ob} rows`);
