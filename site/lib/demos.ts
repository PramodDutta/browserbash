export interface DemoMeta {
    id: string;
    label: string;
    file: string;
}

export const DEMOS: DemoMeta[] = [
    { id: 'hn', label: 'Grab the top HN story', file: '/demos/hn.json' },
    { id: 'example', label: 'Extract a heading', file: '/demos/example.json' },
    { id: 'login', label: 'Login with masked secrets', file: '/demos/login.json' },
    { id: 'prices', label: 'Scrape three prices', file: '/demos/prices.json' },
    { id: 'testmd', label: 'Run a markdown test', file: '/demos/testmd.json' },
];
