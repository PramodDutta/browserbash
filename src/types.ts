export type RunStatus = 'passed' | 'failed' | 'error' | 'timeout';

export const EXIT_CODES: Record<RunStatus, number> = {
    passed: 0,
    failed: 1,
    error: 2,
    timeout: 3,
};

export interface RunOptions {
    objective: string;
    provider: string;
    agent: boolean;
    headless: boolean;
    maxSteps: number;
    timeoutSec: number;
    variables: Record<string, VariableValue>;
    name?: string;
    cdpEndpoint?: string;
    startUrl?: string;
    model?: string;
}

export interface VariableValue {
    value: string;
    secret?: boolean;
}

export interface StepEvent {
    type: 'step';
    step: number;
    status: 'running' | 'passed' | 'failed';
    action: string;
    remark: string;
}

export interface RunEndEvent {
    type: 'run_end';
    status: RunStatus;
    summary: string;
    final_state: Record<string, string>;
    duration_ms: number;
    steps_executed: number;
    provider: string;
    test_url?: string;
}

export interface RunResult {
    status: RunStatus;
    summary: string;
    finalState: Record<string, string>;
    stepsExecuted: number;
    durationMs: number;
    testUrl?: string;
}
