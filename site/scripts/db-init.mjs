#!/usr/bin/env node
// Creates the dashboard tables. Usage: DATABASE_URL=... node scripts/db-init.mjs
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}

const sql = neon(url);

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
        last_used_at TIMESTAMPTZ,
        expires_at   TIMESTAMPTZ
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
        created_at     TIMESTAMPTZ DEFAULT now(),
        expires_at     TIMESTAMPTZ
    )`;
await sql`CREATE INDEX IF NOT EXISTS runs_user_time ON runs (user_id, created_at DESC)`;
// Free-plan retention: existing rows added before this column get a 15-day window.
await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`;
await sql`UPDATE runs SET expires_at = created_at + interval '15 days' WHERE expires_at IS NULL`;
await sql`CREATE INDEX IF NOT EXISTS runs_expiry ON runs (expires_at)`;

// Paid plans. Absent row ⇒ free (15-day retention). plan='pro' ⇒ kept forever.
await sql`
    CREATE TABLE IF NOT EXISTS plans (
        user_id    TEXT PRIMARY KEY,
        plan       TEXT NOT NULL DEFAULT 'free',
        updated_at TIMESTAMPTZ DEFAULT now()
    )`;

const [{ ob }] = await sql`SELECT COUNT(*)::int AS ob FROM onboarding`;
const [{ rn }] = await sql`SELECT COUNT(*)::int AS rn FROM runs`;
const [{ pl }] = await sql`SELECT COUNT(*)::int AS pl FROM plans`;
console.log(`onboarding ${ob} · runs ${rn} · plans ${pl} — all tables ready`);
