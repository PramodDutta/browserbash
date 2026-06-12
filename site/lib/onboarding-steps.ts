export interface OnboardingStep {
    id: string;
    title: string;
    detail: string;
    command?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'install',
        title: 'Install the CLI',
        detail: 'One npm command. Node 18+ and Chrome stable are the only requirements.',
        command: 'npm install -g browserbash-cli',
    },
    {
        id: 'first-run',
        title: 'Run your first objective',
        detail: 'Plain English in, verdict out. Works on free local Ollama or any key you bring.',
        command: 'browserbash run "Open https://example.com and store the main heading text as \'h1\'" --headless',
    },
    {
        id: 'scenario',
        title: 'Beat a practice scenario',
        detail: 'Pick any card on the Learn page — Secret Agent Login teaches the most.',
    },
    {
        id: 'testmd',
        title: 'Commit a markdown test',
        detail: 'browserbash init scaffolds .browserbash/tests/ — run it with testmd and read Result.md.',
        command: 'browserbash init && browserbash testmd run .browserbash/tests/smoke_test.md --headless',
    },
    {
        id: 'agent-docs',
        title: 'Wire it into CI or an agent',
        detail: 'NDJSON events + exit codes 0/1/2/3 — the agents.md guide covers the whole contract.',
    },
];
