export function isAdmin(email?: string | null): boolean {
    if (!email) return false;
    const allow = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    return allow.includes(email.toLowerCase());
}
