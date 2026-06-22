import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

// Brand tokens (mirrors the site's globals.css)
const ACCENT = '#ff5c1a';
const ACCENT_DEEP = '#d8430b';
const INK = '#16130f';
const BG = '#fffdf9';
const LINE = '#e8e1d6';
const TERM = '#14110d';
const OK = '#2fbf71';

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const CMD = 'browserbash run "Log in to TTACart, add a T-shirt, and check out"';

const STEPS: { t: string; ok: boolean }[] = [
    { t: 'engine: stagehand (MIT) · model: local Ollama · $0', ok: false },
    { t: 'open the TTACart store', ok: true },
    { t: 'log in as standard_user', ok: true },
    { t: 'add "T-Shirt (Red)" to the cart', ok: true },
    { t: 'checkout → "Thank you for your order!"', ok: true },
];

// Simplified pixel Bo robot
const Bo: React.FC<{ size: number }> = ({ size }) => {
    const u = size / 10;
    return (
        <div style={{ position: 'relative', width: size, height: size }}>
            <div style={{ position: 'absolute', left: size / 2 - u * 0.4, top: -u * 2.2, width: u * 0.8, height: u * 2.2, background: INK }} />
            <div style={{ position: 'absolute', left: size / 2 - u, top: -u * 3.6, width: u * 2, height: u * 1.6, background: ACCENT, border: `2px solid ${INK}` }} />
            <div style={{ position: 'absolute', inset: 0, background: ACCENT, border: `3px solid ${INK}`, borderRadius: u * 0.6 }} />
            <div style={{ position: 'absolute', left: u * 2, top: u * 3.4, width: u * 1.9, height: u * 1.9, background: '#fff', border: `2px solid ${INK}` }} />
            <div style={{ position: 'absolute', right: u * 2, top: u * 3.4, width: u * 1.9, height: u * 1.9, background: '#fff', border: `2px solid ${INK}` }} />
            <div style={{ position: 'absolute', left: u * 2.7, bottom: u * 2, width: u * 4.6, height: u * 0.9, background: INK }} />
        </div>
    );
};

export const Demo: React.FC = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const typeStart = 18;
    const typeEnd = 100;
    const typed = Math.round(interpolate(frame, [typeStart, typeEnd], [0, CMD.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    const cmdText = CMD.slice(0, typed);
    const caretOn = Math.floor(frame / 8) % 2 === 0;

    const stepBase = 116;
    const stepGap = 22;
    const passStart = stepBase + STEPS.length * stepGap + 14;
    const passSpring = spring({ frame: frame - passStart, fps, config: { damping: 12, stiffness: 130 } });

    const termSpring = spring({ frame: frame - 4, fps, config: { damping: 16 } });
    const termY = interpolate(termSpring, [0, 1], [40, 0]);
    const titleOpacity = interpolate(frame, [4, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

    return (
        <AbsoluteFill style={{ backgroundColor: BG }}>
            {/* grid */}
            <AbsoluteFill
                style={{
                    backgroundImage: `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`,
                    backgroundSize: '40px 40px',
                    opacity: 0.5,
                }}
            />

            {/* wordmark */}
            <div style={{ position: 'absolute', top: 46, left: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
                <Bo size={40} />
                <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 27, color: INK, letterSpacing: 0.5 }}>BrowserBash</span>
            </div>
            <div style={{ position: 'absolute', top: 54, right: 64, fontFamily: MONO, fontSize: 15, color: ACCENT_DEEP, letterSpacing: 2, textTransform: 'uppercase' }}>
                free · open source
            </div>

            {/* terminal */}
            <div
                style={{
                    position: 'absolute',
                    left: 130,
                    right: 130,
                    top: 150,
                    transform: `translateY(${termY}px)`,
                    opacity: termSpring,
                    background: TERM,
                    borderRadius: 16,
                    border: `3px solid ${INK}`,
                    boxShadow: `10px 10px 0 ${ACCENT}`,
                    overflow: 'hidden',
                }}
            >
                <div style={{ background: '#241f19', padding: '13px 18px', display: 'flex', gap: 9, alignItems: 'center' }}>
                    <i style={{ width: 13, height: 13, borderRadius: '50%', background: '#ff5f56' }} />
                    <i style={{ width: 13, height: 13, borderRadius: '50%', background: '#ffbd2e' }} />
                    <i style={{ width: 13, height: 13, borderRadius: '50%', background: '#27c93f' }} />
                    <span style={{ color: '#8a8f98', fontFamily: MONO, fontSize: 14, marginLeft: 10 }}>zsh — browserbash</span>
                </div>
                <div style={{ padding: '26px 30px', fontFamily: MONO, fontSize: 20, lineHeight: 1.65, minHeight: 350 }}>
                    <div style={{ color: '#f4f1ea' }}>
                        <span style={{ color: ACCENT }}>$ </span>
                        {cmdText}
                        {frame < passStart && caretOn ? <span style={{ color: ACCENT }}>{'█'}</span> : null}
                    </div>
                    {STEPS.map((s, i) => {
                        const appear = stepBase + i * stepGap;
                        const o = interpolate(frame, [appear, appear + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                        const dy = interpolate(frame, [appear, appear + 10], [8, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
                        return (
                            <div key={i} style={{ opacity: o, transform: `translateY(${dy}px)`, marginTop: 9, color: s.ok ? '#dfe7d8' : '#8a8f98' }}>
                                {s.ok ? <span style={{ color: OK, fontWeight: 700 }}>{'  ✓ '}</span> : <span>{'  · '}</span>}
                                {s.t}
                            </div>
                        );
                    })}
                    {frame >= passStart ? (
                        <div
                            style={{
                                marginTop: 20,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 12,
                                transform: `scale(${interpolate(passSpring, [0, 1], [0.6, 1])})`,
                                transformOrigin: 'left center',
                                background: OK,
                                color: '#06351d',
                                fontFamily: MONO,
                                fontWeight: 800,
                                fontSize: 21,
                                padding: '10px 18px',
                                borderRadius: 10,
                                border: `3px solid ${INK}`,
                                boxShadow: `4px 4px 0 ${INK}`,
                            }}
                        >
                            {'✓ PASSED — 5 steps · recorded · exit 0'}
                        </div>
                    ) : null}
                </div>
            </div>

            {/* tagline */}
            <div style={{ position: 'absolute', bottom: 50, left: 0, right: 0, textAlign: 'center', opacity: titleOpacity }}>
                <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 38, color: INK, letterSpacing: -1 }}>
                    Plain English in. <span style={{ color: ACCENT_DEEP }}>Real browser out.</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 19, color: '#6b6258', marginTop: 8 }}>browserbash.com — free, no API keys</div>
            </div>
        </AbsoluteFill>
    );
};
