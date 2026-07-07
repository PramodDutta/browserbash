import { describe, expect, it } from 'vitest';
import { buildWebhookBody, isSlackWebhook, type NotifyPayload } from '../../src/notify.js';

const payload: NotifyPayload = {
    event: 'monitor_change',
    status: 'failed',
    title: 'checkout_test',
    summary: 'Step 3 could not find the Pay button',
    data: { duration_ms: 12000 },
};

describe('notify webhook bodies', () => {
    it('detects Slack incoming-webhook urls', () => {
        expect(isSlackWebhook('https://hooks.slack.com/services/T0/B0/xyz')).toBe(true);
        expect(isSlackWebhook('https://example.com/hook')).toBe(false);
    });

    it('sends Slack the {text} shape', () => {
        const body = JSON.parse(buildWebhookBody('https://hooks.slack.com/services/T0/B0/xyz', payload)) as { text: string };
        expect(body.text).toContain('checkout_test');
        expect(body.text).toContain('failed');
        expect(body.text).toContain(':x:');
    });

    it('sends generic webhooks the raw payload', () => {
        const body = JSON.parse(buildWebhookBody('https://example.com/hook', payload)) as NotifyPayload;
        expect(body.event).toBe('monitor_change');
        expect(body.data?.duration_ms).toBe(12000);
    });

    it('marks passing payloads with the check icon on Slack', () => {
        const body = JSON.parse(
            buildWebhookBody('https://hooks.slack.com/services/T0/B0/xyz', { ...payload, status: 'passed' }),
        ) as { text: string };
        expect(body.text).toContain(':white_check_mark:');
    });
});
