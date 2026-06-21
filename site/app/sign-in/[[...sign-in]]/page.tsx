import type { Metadata } from 'next';
import { SignIn, ClerkLoading, ClerkLoaded } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { Bo } from '@/components/Bo';
import '../../landing.css';
import '../../auth.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Log in — BrowserBash',
    description: 'Log in to your free BrowserBash dashboard to see your runs, recordings and per-run replays.',
    robots: { index: false, follow: true },
};

export default async function Page() {
    // Already signed in? Don't strand the user on a blank "Welcome back" page —
    // Clerk renders nothing here for an authed user, so send them to the dashboard.
    if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
        const { userId } = await auth();
        if (userId) redirect('/dashboard');
    }
    return (
        <main className="authpage container">
            <a href="/" className="authpage__brand">
                <Bo size={30} interactive={false} pose="idle" />
                <span>BrowserBash</span>
            </a>
            <h1 className="authpage__title">Welcome back</h1>
            <p className="authpage__sub">Free, open source. Log in to see your runs and recordings.</p>
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
                <>
                    <ClerkLoading>
                        <div className="authpage__loading" aria-live="polite">
                            <span className="authpage__spinner" aria-hidden="true" />
                            Loading sign-in…
                        </div>
                    </ClerkLoading>
                    <ClerkLoaded>
                        <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
                    </ClerkLoaded>
                </>
            ) : (
                <p className="authpage__sub">Sign-in is not configured in this environment.</p>
            )}
        </main>
    );
}
