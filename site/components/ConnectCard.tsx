'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from './CopyButton';

interface KeyInfo {
    id: string;
    label: string | null;
    cliVersion: string | null;
    createdAt: string | null;
    lastUsedAt: string | null;
    expiresAt: string | null;
    daysLeft: number | null;
    expired: boolean;
}

export function ConnectCard() {
    const [keys, setKeys] = useState<KeyInfo[] | null>(null);
    const [freshKey, setFreshKey] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function load() {
        const res = await fetch('/api/keys');
        if (res.ok) setKeys(((await res.json()) as { keys: KeyInfo[] }).keys);
    }
    useEffect(() => { void load(); }, []);

    async function generate() {
        setBusy(true);
        try {
            const res = await fetch('/api/keys', { method: 'POST' });
            const data = (await res.json()) as { key?: string };
            if (res.ok && data.key) {
                setFreshKey(data.key);
                await load();
            }
        } finally {
            setBusy(false);
        }
    }

    async function revoke() {
        setBusy(true);
        try {
            await fetch('/api/keys', { method: 'DELETE' });
            setFreshKey(null);
            await load();
        } finally {
            setBusy(false);
        }
    }

    const active = keys?.[0];
    const connectCmd = freshKey ? `browserbash connect --key ${freshKey}` : null;

    return (
        <div className="pixel-card connect">
            <span className="dash__lbl">connect your cli</span>
            {freshKey ? (
                <>
                    <p className="connect__note connect__note--warn">
                        Copy this now — it is shown once, and it works for 30 days. Run it in your terminal:
                    </p>
                    <div className="connect__cmd">
                        <code>{connectCmd}</code>
                        <CopyButton text={connectCmd!} />
                    </div>
                </>
            ) : active ? (
                <>
                    <p className="connect__status">
                        <span className={`connect__dot ${active.expired ? 'connect__dot--dead' : ''}`} /> Connected key {active.id}
                        {active.cliVersion ? ` · CLI v${active.cliVersion}` : ''}
                        {active.lastUsedAt ? ` · last run ${active.lastUsedAt}` : ' · no runs yet'}
                    </p>
                    {active.expired ? (
                        <p className="connect__note connect__note--warn">
                            This key expired. Generate a fresh one and reconnect — runs won&apos;t sync until you do.
                        </p>
                    ) : active.daysLeft !== null && (
                        <p className={`connect__expiry ${active.daysLeft <= 5 ? 'connect__expiry--low' : ''}`}>
                            Expires {active.expiresAt} · {active.daysLeft} day{active.daysLeft === 1 ? '' : 's'} left
                        </p>
                    )}
                    <div className="connect__actions">
                        <button className="pixel-btn ghost connect__btn" onClick={generate} disabled={busy}>
                            {active.expired ? 'generate new key' : 'rotate key'}
                        </button>
                        <button className="connect__revoke" onClick={revoke} disabled={busy}>revoke</button>
                    </div>
                </>
            ) : keys === null ? (
                <p className="connect__note">Loading…</p>
            ) : (
                <>
                    <p className="connect__note">
                        Generate a key, run one command, and every CLI run lands here — verdicts, durations, extracted values.
                    </p>
                    <button className="pixel-btn connect__btn" onClick={generate} disabled={busy}>
                        {busy ? '…' : 'Generate API key'}
                    </button>
                </>
            )}
        </div>
    );
}
