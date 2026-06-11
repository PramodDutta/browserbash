import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    use: {
        baseURL: 'http://127.0.0.1:3100',
        channel: 'chrome',
    },
    webServer: {
        // Production build: deterministic hydration (dev-mode HMR stalls
        // hydration in driven browsers) and it's what actually ships.
        command: 'npm run build && npx next start -p 3100',
        url: 'http://127.0.0.1:3100',
        reuseExistingServer: false,
        timeout: 180000,
    },
});
