import { createHash, randomBytes } from 'node:crypto';

/** Key format shown to the user once: bb_<40 hex>. Only the SHA-256 lands in the DB. */
export function generateApiKey(): { key: string; hash: string } {
    const key = `bb_${randomBytes(20).toString('hex')}`;
    return { key, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}

export function maskKey(hash: string): string {
    return `bb_…${hash.slice(0, 6)}`;
}

export function bearerFrom(header: string | null): string | null {
    if (!header) return null;
    const m = header.match(/^Bearer\s+(bb_[a-f0-9]{40})$/i);
    return m ? m[1] : null;
}
