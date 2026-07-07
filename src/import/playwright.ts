/**
 * Heuristic Playwright-spec -> *_test.md converter (`browserbash import`).
 *
 * Deterministic on purpose: no model call, so the output is reproducible,
 * testable, and reviewable. Lines the heuristics cannot translate land in an
 * import report instead of being silently dropped or hallucinated — the
 * generated tests are a starting point a human reviews, never auto-trusted.
 */

export interface ImportedTest {
    title: string;
    steps: string[];
}

export interface SkippedLine {
    test: string;
    code: string;
    reason: string;
}

export interface ImportResult {
    sourceFile: string;
    describe?: string;
    tests: ImportedTest[];
    skipped: SkippedLine[];
    /** process.env.X references found — become {{X}} variables. */
    variables: string[];
}

/** "the 'Add to cart' button" from a Playwright locator expression. */
function describeLocator(expr: string): string | null {
    let m = expr.match(/getByRole\(\s*['"`](\w+)['"`]\s*,\s*\{[^}]*name:\s*['"`](.+?)['"`]/);
    if (m) return `the '${m[2]}' ${m[1]}`;
    m = expr.match(/getByRole\(\s*['"`](\w+)['"`]\s*\)/);
    if (m) return `the ${m[1]}`;
    m = expr.match(/getByText\(\s*['"`](.+?)['"`]/);
    if (m) return `'${m[1]}'`;
    m = expr.match(/getByLabel\(\s*['"`](.+?)['"`]/);
    if (m) return `the '${m[1]}' field`;
    m = expr.match(/getByPlaceholder\(\s*['"`](.+?)['"`]/);
    if (m) return `the field with placeholder '${m[1]}'`;
    m = expr.match(/getByTestId\(\s*['"`](.+?)['"`]/);
    if (m) return `the element with test id '${m[1]}'`;
    m = expr.match(/getByTitle\(\s*['"`](.+?)['"`]/);
    if (m) return `the element titled '${m[1]}'`;
    m = expr.match(/(?:locator|\$)\(\s*['"`](.+?)['"`]/);
    if (m) return `the element matching \`${m[1]}\``;
    return null;
}

/** Rewrite process.env.FOO / ${process.env.FOO} into {{FOO}} and collect names. */
function templatizeEnv(value: string, variables: Set<string>): string {
    return value.replace(/\$?\{?process\.env\.([A-Z0-9_]+)\}?/g, (_, name: string) => {
        variables.add(name);
        return `{{${name}}}`;
    });
}

/** Translate one statement; null = not actionable (structural), undefined = unknown. */
function translateLine(raw: string, variables: Set<string>): string | null | undefined {
    const line = raw.trim().replace(/;$/, '');
    if (
        line === '' || line === '}' || line === '})' || line === '});' ||
        line.startsWith('//') || line.startsWith('/*') || line.startsWith('*') ||
        line.startsWith('import ') || line.startsWith('const {') ||
        line.startsWith('test.describe') || line.startsWith('test.use') ||
        line.startsWith('test.beforeAll') || line.startsWith('test.afterAll') ||
        line.startsWith('test.setTimeout') ||
        // The tail of the test(...) signature line: ", async ({ page }) => {"
        /^,?\s*async\b.*(?:=>|\bfunction\b)\s*\{?$/.test(line)
    ) {
        return null;
    }

    const l = templatizeEnv(line, variables);

    // A value argument is either a string literal or a templatized env var
    // ({{FOO}} after templatizeEnv above).
    const unquote = (arg: string): string => arg.replace(/^['"`]|['"`]$/g, '');
    const VALUE = String.raw`(['"\`].*?['"\`]|\{\{[A-Z0-9_]+\}\})`;

    let m = l.match(/page\d*\.goto\(\s*['"`](.+?)['"`]/);
    if (m) return `Open ${m[1]}`;

    m = l.match(new RegExp(String.raw`(.+?)\.fill\(\s*${VALUE}\s*\)`));
    if (m) {
        const target = describeLocator(m[1]);
        if (target) return `Type '${unquote(m[2])}' into ${target}`;
    }

    m = l.match(/(.+?)\.press\(\s*['"`](.+?)['"`]\s*\)/);
    if (m) {
        const target = describeLocator(m[1]);
        return target ? `Press ${m[2]} in ${target}` : `Press ${m[2]}`;
    }

    m = l.match(/(.+?)\.(click|dblclick)\(\s*\)/);
    if (m) {
        const target = describeLocator(m[1]);
        if (target) return `${m[2] === 'dblclick' ? 'Double-click' : 'Click'} ${target}`;
    }

    m = l.match(/(.+?)\.check\(\s*\)/);
    if (m) {
        const target = describeLocator(m[1]);
        if (target) return `Check ${target}`;
    }

    m = l.match(/(.+?)\.selectOption\(\s*['"`](.+?)['"`]\s*\)/);
    if (m) {
        const target = describeLocator(m[1]);
        if (target) return `Select '${m[2]}' in ${target}`;
    }

    // page.click('sel') / page.fill('sel', 'v') legacy API
    m = l.match(/page\d*\.click\(\s*['"`](.+?)['"`]\s*\)/);
    if (m) return `Click the element matching \`${m[1]}\``;
    m = l.match(new RegExp(String.raw`page\d*\.fill\(\s*['"\`](.+?)['"\`]\s*,\s*${VALUE}\s*\)`));
    if (m) return `Type '${unquote(m[2])}' into the element matching \`${m[1]}\``;

    // Assertions -> deterministic Verify grammar (testmd v2 executes these
    // without a model; v1 files hand them to the agent as plain steps).
    m = l.match(/expect\(\s*page\d*\s*\)\.toHaveURL\(\s*['"`\/](.+?)['"`\/]\s*\)/);
    if (m) return `Verify the URL contains '${m[1]}'`;
    m = l.match(/expect\(\s*page\d*\s*\)\.toHaveTitle\(\s*['"`\/](.+?)['"`\/]\s*\)/);
    if (m) return `Verify the title contains '${m[1]}'`;
    m = l.match(/expect\((.+?)\)\.toBeVisible\(\s*\)/);
    if (m) {
        const target = describeLocator(m[1]);
        if (target) return `Verify ${target} is visible`;
    }
    m = l.match(/expect\((.+?)\)\.toHaveText\(\s*['"`](.+?)['"`]/);
    if (m) return `Verify the text '${m[2]}' is visible`;
    m = l.match(/expect\((.+?)\)\.toContainText\(\s*['"`](.+?)['"`]/);
    if (m) return `Verify the text '${m[2]}' is visible`;

    m = l.match(/page\d*\.waitForURL\(\s*['"`\/](.+?)['"`\/]/);
    if (m) return `Wait until the URL contains '${m[1]}'`;
    m = l.match(/page\d*\.waitForSelector\(\s*['"`](.+?)['"`]/);
    if (m) return `Wait for the element matching \`${m[1]}\` to appear`;

    // Anything that clearly does browser/assertion work but did not match.
    if (/\b(page\d*|expect|locator|getBy\w+)\b/.test(l)) return undefined;
    return null;
}

/** Convert one Playwright spec source into testmd drafts + a skip report. */
export function convertPlaywrightSpec(source: string, sourceFile: string): ImportResult {
    const variables = new Set<string>();
    const describeMatch = source.match(/test\.describe(?:\.\w+)?\(\s*['"`](.+?)['"`]/);
    const result: ImportResult = {
        sourceFile,
        describe: describeMatch?.[1],
        tests: [],
        skipped: [],
        variables: [],
    };

    // Split on test( boundaries; each block runs to the next test( or EOF.
    const testRe = /(?:^|\n)\s*test(?:\.(?:only|slow|fixme))?\(\s*['"`](.+?)['"`]/g;
    const boundaries: Array<{ title: string; start: number }> = [];
    for (let m = testRe.exec(source); m; m = testRe.exec(source)) {
        boundaries.push({ title: m[1], start: m.index + m[0].length });
    }

    for (let i = 0; i < boundaries.length; i++) {
        const { title, start } = boundaries[i];
        const end = i + 1 < boundaries.length ? boundaries[i + 1].start : source.length;
        const steps: string[] = [];
        for (const raw of source.slice(start, end).split('\n')) {
            const translated = translateLine(raw, variables);
            if (typeof translated === 'string') steps.push(translated);
            else if (translated === undefined) {
                result.skipped.push({ test: title, code: raw.trim(), reason: 'no heuristic for this call' });
            }
        }
        if (steps.length > 0) result.tests.push({ title, steps });
    }

    result.variables = [...variables].sort();
    return result;
}

/** Render one imported test as a *_test.md file body. */
export function renderTestMd(test: ImportedTest, sourceFile: string): string {
    return [
        `# ${test.title}`,
        '',
        `<!-- Imported from ${sourceFile} by \`browserbash import\`. Review before trusting. -->`,
        '',
        ...test.steps.map((s) => `- ${s}`),
        '',
    ].join('\n');
}

/** Slug for the generated filename. */
export function testFileName(title: string): string {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'imported';
    return `${slug}_test.md`;
}

/** Render the IMPORT-REPORT.md content. */
export function renderImportReport(results: ImportResult[]): string {
    const lines = ['# Import report', ''];
    const allVars = [...new Set(results.flatMap((r) => r.variables))].sort();
    for (const r of results) {
        lines.push(`## ${r.sourceFile}`, '');
        lines.push(`- Tests converted: ${r.tests.length}`);
        lines.push(`- Lines needing manual attention: ${r.skipped.length}`, '');
        if (r.skipped.length > 0) {
            lines.push('| Test | Code | Why |', '|---|---|---|');
            for (const s of r.skipped) {
                lines.push(`| ${s.test} | \`${s.code.replace(/\|/g, '\\|').slice(0, 80)}\` | ${s.reason} |`);
            }
            lines.push('');
        }
    }
    if (allVars.length > 0) {
        lines.push('## Variables to define', '');
        lines.push('These came from `process.env.*` in the specs. Add them to `.browserbash/variables/default.json`:', '');
        lines.push('```json');
        lines.push(JSON.stringify(Object.fromEntries(allVars.map((v) => [v, v.toLowerCase().includes('pass') || v.toLowerCase().includes('secret') || v.toLowerCase().includes('key') ? { value: 'change-me', secret: true } : 'change-me'])), null, 2));
        lines.push('```', '');
    }
    lines.push('Generated tests are a starting point: run them, watch the recording, and fix wording before committing.', '');
    return lines.join('\n');
}
