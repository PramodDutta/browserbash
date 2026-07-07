import fs from 'node:fs';
import path from 'node:path';
import { configDir } from './config.js';

/**
 * Saved login sessions (Playwright storageState) so suites stop re-logging
 * in for every test. Files live in ~/.browserbash/auth/<name>.json, mode
 * 0600: they contain cookies and localStorage, i.e. live credentials.
 *
 * Origin pinning: the origins present at save time are recorded next to the
 * state. At injection time callers can warn when the target start URL's
 * origin was never part of the saved session (a session for site A silently
 * doing nothing on site B is the confusing failure mode).
 */

export interface AuthProfile {
    name: string;
    file: string;
    origins: string[];
    savedAt: string;
}

interface StorageStateFile {
    cookies?: Array<{ domain?: string }>;
    origins?: Array<{ origin?: string }>;
    /** BrowserBash metadata, ignored by Playwright. */
    __browserbash?: { savedAt: string };
}

export function authDir(): string {
    return path.join(configDir(), 'auth');
}

function profilePath(name: string): string {
    if (!/^[\w.-]+$/.test(name)) {
        throw new Error(`Auth profile name '${name}' may only contain letters, digits, dot, dash, underscore`);
    }
    return path.join(authDir(), `${name}.json`);
}

function originsOf(state: StorageStateFile): string[] {
    const fromOrigins = (state.origins ?? []).map((o) => o.origin ?? '').filter(Boolean);
    const fromCookies = (state.cookies ?? [])
        .map((c) => (c.domain ?? '').replace(/^\./, ''))
        .filter(Boolean)
        .map((d) => `https://${d}`);
    return [...new Set([...fromOrigins, ...fromCookies])];
}

/** Persist a storageState object captured from a live context. */
export function saveAuthProfile(name: string, storageState: object, nowIso: string): AuthProfile {
    const file = profilePath(name);
    fs.mkdirSync(authDir(), { recursive: true, mode: 0o700 });
    const state = { ...(storageState as StorageStateFile), __browserbash: { savedAt: nowIso } };
    fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    return { name, file, origins: originsOf(state), savedAt: nowIso };
}

/** Resolve a profile by name; throws with the fix when it does not exist. */
export function resolveAuthProfile(name: string): AuthProfile {
    const file = profilePath(name);
    if (!fs.existsSync(file)) {
        const known = listAuthProfiles().map((p) => p.name);
        throw new Error(
            `No saved auth profile '${name}'. ` +
            (known.length > 0 ? `Saved profiles: ${known.join(', ')}. ` : '') +
            `Create one with: browserbash auth save ${name} --url <login-url>`,
        );
    }
    const state = JSON.parse(fs.readFileSync(file, 'utf-8')) as StorageStateFile;
    return { name, file, origins: originsOf(state), savedAt: state.__browserbash?.savedAt ?? 'unknown' };
}

export function listAuthProfiles(): AuthProfile[] {
    if (!fs.existsSync(authDir())) return [];
    return fs
        .readdirSync(authDir())
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            try {
                return resolveAuthProfile(f.replace(/\.json$/, ''));
            } catch {
                return null;
            }
        })
        .filter((p): p is AuthProfile => p !== null);
}

export function deleteAuthProfile(name: string): boolean {
    const file = profilePath(name);
    if (!fs.existsSync(file)) return false;
    fs.rmSync(file);
    return true;
}

/** True when the start URL's origin appeared in the saved session. */
export function profileCoversOrigin(profile: AuthProfile, url: string | undefined): boolean {
    if (!url) return true; // no start URL — nothing to compare against
    let origin: string;
    try {
        origin = new URL(url).origin;
    } catch {
        return true;
    }
    if (profile.origins.length === 0) return true;
    const host = new URL(origin).hostname;
    return profile.origins.some((o) => {
        try {
            const oHost = new URL(o).hostname;
            return host === oHost || host.endsWith(`.${oHost}`) || oHost.endsWith(`.${host}`);
        } catch {
            return false;
        }
    });
}
