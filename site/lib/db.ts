import { neon } from '@neondatabase/serverless';

export type Sql = ReturnType<typeof neon>;

export function sql(): Sql {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    return neon(url);
}
