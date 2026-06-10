import fs from 'node:fs';
import path from 'node:path';

export interface TestMdFile {
    title: string;
    steps: string[];
    sourcePath: string;
}

/**
 * Parse a *_test.md file:
 *   # Title              → test name
 *   - step text          → ordered plain-English steps (also supports 1. lists)
 *   @import ./helper.md  → splice steps from another file (relative path)
 *
 * Everything else (prose, headings below h1) is ignored, so files stay
 * readable / reviewable as normal Markdown.
 */
export function parseTestMd(filePath: string, seen: Set<string> = new Set()): TestMdFile {
    const absolute = path.resolve(filePath);
    if (seen.has(absolute)) {
        throw new Error(`Circular @import detected: ${absolute}`);
    }
    seen.add(absolute);

    if (!fs.existsSync(absolute)) {
        throw new Error(`Test file not found: ${absolute}`);
    }
    const raw = fs.readFileSync(absolute, 'utf-8');

    let title = path.basename(absolute).replace(/_test\.md$/, '');
    const steps: string[] = [];

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('# ') && title === path.basename(absolute).replace(/_test\.md$/, '')) {
            title = trimmed.slice(2).trim();
            continue;
        }
        const importMatch = trimmed.match(/^@import\s+(.+)$/);
        if (importMatch) {
            const importedPath = path.resolve(path.dirname(absolute), importMatch[1].trim());
            steps.push(...parseTestMd(importedPath, seen).steps);
            continue;
        }
        const stepMatch = trimmed.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
        if (stepMatch) {
            steps.push(stepMatch[1].trim());
        }
    }

    if (steps.length === 0) {
        throw new Error(`No steps found in ${absolute} — add "- <step>" list items`);
    }
    return { title, steps, sourcePath: absolute };
}
