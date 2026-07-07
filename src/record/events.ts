/**
 * Recorded interaction events (`browserbash record`) and their conversion to
 * plain-English *_test.md steps. Pure module: the browser capture lives in
 * capture.ts, this one is deterministic and unit-tested.
 */

export interface RecordedEvent {
    kind: 'navigate' | 'click' | 'input' | 'enter' | 'select' | 'check';
    ts: number;
    url?: string;
    /** Human description of the target ("the 'Sign in' button"). */
    target?: string;
    value?: string;
    /** True for password fields — the value is NEVER captured. */
    secret?: boolean;
}

/** ms window in which a navigation is considered caused by the last interaction. */
const CAUSED_NAV_WINDOW_MS = 3000;

/**
 * Convert a raw event log into ordered plain-English steps.
 * Rules:
 *  - the first navigation becomes "Open <url>"
 *  - navigations right after a click/enter are implicit (the click caused
 *    them) and are dropped; address-bar navigations are kept
 *  - consecutive inputs into the same target collapse to the final value
 *  - password inputs become {{password}}-style variables, never raw values
 */
export function eventsToSteps(events: RecordedEvent[]): { steps: string[]; secretVars: string[] } {
    const steps: string[] = [];
    const secretVars: string[] = [];
    let lastInteractionTs = -Infinity;
    let secretCount = 0;

    const collapsed: RecordedEvent[] = [];
    for (const e of events) {
        const prev = collapsed[collapsed.length - 1];
        if (e.kind === 'input' && prev?.kind === 'input' && prev.target === e.target) {
            collapsed[collapsed.length - 1] = e; // final value wins
        } else if (e.kind === 'navigate' && prev?.kind === 'navigate') {
            collapsed[collapsed.length - 1] = e; // redirect chain: keep the landing URL
        } else {
            collapsed.push(e);
        }
    }

    for (let i = 0; i < collapsed.length; i++) {
        const e = collapsed[i];
        switch (e.kind) {
            case 'navigate': {
                const causedByInteraction = e.ts - lastInteractionTs <= CAUSED_NAV_WINDOW_MS;
                if (steps.length === 0 || !causedByInteraction) {
                    steps.push(`Open ${e.url}`);
                }
                break;
            }
            case 'click':
                steps.push(`Click ${e.target}`);
                lastInteractionTs = e.ts;
                break;
            case 'input': {
                if (e.secret) {
                    secretCount += 1;
                    const varName = secretCount === 1 ? 'password' : `password_${secretCount}`;
                    secretVars.push(varName);
                    steps.push(`Type {{${varName}}} into ${e.target}`);
                } else {
                    steps.push(`Type '${e.value ?? ''}' into ${e.target}`);
                }
                lastInteractionTs = e.ts;
                break;
            }
            case 'enter':
                steps.push(`Press Enter in ${e.target}`);
                lastInteractionTs = e.ts;
                break;
            case 'select':
                steps.push(`Select '${e.value ?? ''}' in ${e.target}`);
                lastInteractionTs = e.ts;
                break;
            case 'check':
                steps.push(`Check ${e.target}`);
                lastInteractionTs = e.ts;
                break;
        }
    }
    return { steps, secretVars };
}

/** Render the recorded steps as a *_test.md body. */
export function renderRecordedTestMd(title: string, steps: string[], secretVars: string[]): string {
    const lines = [
        `# ${title}`,
        '',
        '<!-- Recorded with `browserbash record`. Review the steps, then run: browserbash testmd run <this file> -->',
        '',
        ...steps.map((s) => `- ${s}`),
        '',
    ];
    if (secretVars.length > 0) {
        lines.push(
            '<!--',
            'Secret values were NOT captured. Define them before running:',
            `  .browserbash/variables/default.json -> ${JSON.stringify(Object.fromEntries(secretVars.map((v) => [v, { value: 'change-me', secret: true }])))}`,
            '-->',
            '',
        );
    }
    return lines.join('\n');
}
