'use client';

import { useCallback, useRef, useState } from 'react';
import './bo.css';

/**
 * Bo — the BrowserBash mascot. A 16×14 pixel-grid robot with a hammer,
 * rendered as inline SVG rects so it stays crisp at any size and themes
 * with CSS variables. All motion is CSS keyframes (steps()) — no JS loops.
 */

const PALETTE: Record<string, string> = {
    D: 'var(--ink)',          // outline
    O: 'var(--accent)',       // body orange
    A: 'var(--accent-deep)',  // antenna tip
    W: '#ffffff',             // eye white
    B: 'var(--ink)',          // pupil
    M: '#9aa3ad',             // hammer head steel
    H: '#8a5a2b',             // hammer handle wood
};

const BODY: string[] = [
    '.......AA.......',
    '.......DD.......',
    '...DDDDDDDDDD...',
    '..DOOOOOOOOOOD..',
    '.DOOOOOOOOOOOOD.',
    '.DOOWWOOOOWWOOD.',
    '.DOOWBOOOOWBOOD.',
    '.DOOOOOOOOOOOOD.',
    '.DOODDDDDDDOOOD.',
    '.DOOOOOOOOOOOOD.',
    '..DOOOOOOOOOOD..',
    '...DDDDDDDDDD...',
];

const LEGS_A: string[] = [
    '....DOD..DOD....',
    '...DDDD..DDDD...',
];

const LEGS_B: string[] = [
    '...DOD....DOD...',
    '..DDDD...DDDD...',
];

const HAMMER: string[] = [
    '.DDDD.',
    'DMMMMD',
    'DMMMMD',
    '.DDDD.',
    '..HH..',
    '..HH..',
    '..HH..',
    '..HH..',
];

function Px({ rows, y = 0 }: { rows: string[]; y?: number }) {
    const rects: React.ReactElement[] = [];
    rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
            const c = row[rx];
            if (c === '.') continue;
            rects.push(<rect key={`${rx}-${ry}`} x={rx} y={ry + y} width={1} height={1} fill={PALETTE[c]} />);
        }
    });
    return <>{rects}</>;
}

export type BoPose = 'idle' | 'walk';

export function Bo({ pose = 'idle', size = 96, interactive = true, className = '' }: {
    pose?: BoPose;
    size?: number;
    interactive?: boolean;
    className?: string;
}) {
    const [bashing, setBashing] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const bash = useCallback(() => {
        if (!interactive) return;
        setBashing(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setBashing(false), 650);
    }, [interactive]);

    return (
        <svg
            viewBox="0 0 22 14"
            width={(size / 14) * 22}
            height={size}
            className={`bo bo--${pose} ${bashing ? 'bo--bashing' : ''} ${className}`}
            shapeRendering="crispEdges"
            onClick={bash}
            role={interactive ? 'button' : 'img'}
            aria-label={interactive ? 'Bo the BrowserBash mascot — click to bash' : 'Bo the BrowserBash mascot'}
        >
            <g className="bo__body">
                <Px rows={BODY} />
                {/* eyelids for blink */}
                <g className="bo__lids">
                    <rect x={4} y={5} width={2} height={2} fill="var(--accent)" />
                    <rect x={10} y={5} width={2} height={2} fill="var(--accent)" />
                </g>
                <g className="bo__legs bo__legs--a"><Px rows={LEGS_A} y={12} /></g>
                <g className="bo__legs bo__legs--b"><Px rows={LEGS_B} y={12} /></g>
            </g>
            <g className="bo__hammer">
                <Px rows={HAMMER} />
            </g>
        </svg>
    );
}

/** A little Chrome-ish window for Bo to bash. Cracks when told to. */
export function BrowserWindow({ cracked = false, size = 72, className = '' }: {
    cracked?: boolean;
    size?: number;
    className?: string;
}) {
    return (
        <svg
            viewBox="0 0 20 14"
            width={(size / 14) * 20}
            height={size}
            className={`bwin ${cracked ? 'bwin--cracked' : ''} ${className}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
        >
            <rect x={0} y={0} width={20} height={14} fill="var(--ink)" />
            <rect x={1} y={1} width={18} height={3} fill="var(--bg-soft)" />
            <rect x={2} y={2} width={1} height={1} fill="var(--err)" />
            <rect x={4} y={2} width={1} height={1} fill="var(--warn)" />
            <rect x={6} y={2} width={1} height={1} fill="var(--ok)" />
            <rect x={1} y={4} width={18} height={9} fill="#ffffff" />
            <rect x={3} y={6} width={10} height={1} fill="var(--line)" />
            <rect x={3} y={8} width={13} height={1} fill="var(--line)" />
            <rect x={3} y={10} width={7} height={1} fill="var(--line)" />
            <g className="bwin__crack" stroke="var(--ink)" strokeWidth={0.4} fill="none">
                <path d="M10 4 L8.5 7 L10.5 9 L9 13" />
                <path d="M10 4 L12 6.5 L11 8" />
                <path d="M8.5 7 L6 8.5" />
                <path d="M10.5 9 L13.5 10.5" />
            </g>
        </svg>
    );
}
