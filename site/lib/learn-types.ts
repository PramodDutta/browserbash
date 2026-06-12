export interface Scenario {
    id: string;
    title: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    category: string;
    targetUrl: string;
    objective: string;
    command: string;
    hints: string[];
    expected: string;
    learns: string;
}

export interface TutorialSection {
    id: string;
    title: string;
    body: string;
    code: string;
}
