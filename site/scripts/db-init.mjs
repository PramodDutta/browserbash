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

await sql`
    CREATE TABLE IF NOT EXISTS api_keys (
        key_hash     TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL,
        label        TEXT DEFAULT 'default',
        cli_version  TEXT,
        created_at   TIMESTAMPTZ DEFAULT now(),
        last_used_at TIMESTAMPTZ
    )`;
await sql`CREATE INDEX IF NOT EXISTS api_keys_user ON api_keys (user_id)`;

await sql`
    CREATE TABLE IF NOT EXISTS runs (
        id             SERIAL PRIMARY KEY,
        user_id        TEXT NOT NULL,
        objective      TEXT NOT NULL,
        status         TEXT NOT NULL,
        duration_ms    INTEGER NOT NULL DEFAULT 0,
        steps_executed INTEGER NOT NULL DEFAULT 0,
        provider       TEXT,
        model          TEXT,
        final_state    JSONB DEFAULT '{}'::jsonb,
        cli_version    TEXT,
        created_at     TIMESTAMPTZ DEFAULT now()
    )`;
await sql`CREATE INDEX IF NOT EXISTS runs_user_time ON runs (user_id, created_at DESC)`;

const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM waitlist`;
const [{ ob }] = await sql`SELECT COUNT(*)::int AS ob FROM onboarding`;
const [{ rn }] = await sql`SELECT COUNT(*)::int AS rn FROM runs`;
console.log(`waitlist ${count} · onboarding ${ob} · runs ${rn} — all tables ready`);
