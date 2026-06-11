import { z } from 'zod';

export const WaitlistInput = z.object({
    email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254)),
    name: z.string().trim().max(100).optional(),
    useCase: z.string().trim().max(500).optional(),
    // Honeypot: real users never fill this hidden field.
    website: z.string().max(0).optional(),
});

export type WaitlistInputT = z.infer<typeof WaitlistInput>;

// Minimal query interface so logic stays testable without a live Neon.
export type QueryFn = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export async function addToWaitlist(
    db: QueryFn,
    input: Pick<WaitlistInputT, 'email' | 'name' | 'useCase'>,
): Promise<{ position: number; already: boolean }> {
    const inserted = await db`
        INSERT INTO waitlist (email, name, use_case)
        VALUES (${input.email}, ${input.name ?? null}, ${input.useCase ?? null})
        ON CONFLICT (email) DO NOTHING
        RETURNING id`;
    const [{ count }] = await db`SELECT COUNT(*)::int AS count FROM waitlist`;
    return { position: Number(count), already: inserted.length === 0 };
}
