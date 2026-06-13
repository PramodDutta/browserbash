import { spawn } from 'node:child_process';
import { writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

/**
 * Session video for the Stagehand engine. Stagehand v3 drives Chrome over its
 * own CDP connection (no Playwright recordVideo), so we tap its CDP session
 * with Page.startScreencast, collect JPEG frames during the run, and stitch
 * them into a .webm with ffmpeg — giving real session video on the free /
 * default engine, not just the builtin one. Best-effort throughout: a missing
 * ffmpeg or a capture hiccup degrades to "no video", never a failed run.
 */

/** Minimal shape of Stagehand's CDP session (send/on/off). */
export interface CdpSession {
    send(method: string, params?: unknown): Promise<unknown>;
    on(event: string, handler: (payload: ScreencastFrame) => void): void;
    off(event: string, handler: (payload: ScreencastFrame) => void): void;
}

interface ScreencastFrame {
    data: string; // base64 JPEG
    sessionId: number;
    metadata?: { timestamp?: number };
}

export interface ScreencastRecorder {
    /** Stop capture and encode. Returns the webm path, or undefined if nothing usable. */
    stop(): Promise<string | undefined>;
}

async function ffmpegPath(): Promise<string> {
    try {
        const m = (await import('@ffmpeg-installer/ffmpeg')) as { default?: { path?: string }; path?: string };
        return m.default?.path ?? m.path ?? 'ffmpeg';
    } catch {
        return 'ffmpeg'; // fall back to a system ffmpeg on PATH
    }
}

export async function startScreencast(session: CdpSession, dir: string): Promise<ScreencastRecorder> {
    const frames: Array<{ file: string; ts: number }> = [];
    let n = 0;

    const onFrame = (f: ScreencastFrame): void => {
        try {
            const file = join(dir, `f${String(n++).padStart(5, '0')}.jpg`);
            writeFileSync(file, Buffer.from(f.data, 'base64'));
            frames.push({ file, ts: f.metadata?.timestamp ?? frames.length * 0.3 });
        } catch {
            // drop a bad frame, keep recording
        }
        // ack so Chrome keeps sending frames
        void session.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => undefined);
    };

    session.on('Page.screencastFrame', onFrame);
    await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 60,
        everyNthFrame: 1,
        maxWidth: 1280,
        maxHeight: 720,
    });

    return {
        stop: async (): Promise<string | undefined> => {
            await session.send('Page.stopScreencast').catch(() => undefined);
            session.off('Page.screencastFrame', onFrame);
            if (frames.length < 2) return undefined;
            return encodeWebm(frames, dir);
        },
    };
}

function encodeWebm(frames: Array<{ file: string; ts: number }>, dir: string): Promise<string | undefined> {
    // ffconcat with per-frame durations from CDP timestamps → real-time-ish playback.
    const base = frames[0].ts;
    let txt = 'ffconcat version 1.0\n';
    for (let i = 0; i < frames.length; i++) {
        txt += `file '${basename(frames[i].file)}'\n`;
        const next = frames[i + 1];
        const dur = next ? Math.min(2, Math.max(0.05, (next.ts - frames[i].ts) || 0.2)) : 0.4;
        txt += `duration ${dur.toFixed(3)}\n`;
    }
    txt += `file '${basename(frames[frames.length - 1].file)}'\n`;
    const list = join(dir, 'frames.txt');
    writeFileSync(list, txt);
    void base;

    const out = join(dir, 'video.webm');
    return ffmpegPath().then(
        (ff) =>
            new Promise<string | undefined>((resolve) => {
                const args = [
                    '-y',
                    '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
                    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                    '-pix_fmt', 'yuv420p',
                    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36',
                    '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1',
                    '-an',
                    'video.webm',
                ];
                const p = spawn(ff, args, { cwd: dir, stdio: 'ignore' });
                p.on('error', () => resolve(undefined));
                p.on('exit', (code) => resolve(code === 0 && existsSync(out) ? out : undefined));
            }),
    );
}
