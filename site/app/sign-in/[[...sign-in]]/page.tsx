import type { Metadata } from 'next';
import { SignIn } from '@clerk/nextjs';
import { Bo } from '@/components/Bo';
import '../../landing.css';
import '../../auth.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Log in — BrowserBash',
    description: 'Log in to your free BrowserBash dashboard to see your runs, recordings and per-run replays.',
    robots: { index: false, follow: true },
};

export default function Page() {
    return (
        <main className="authpage container">
            <a href="/" className="authpage__brand">
                <Bo size={30} interactive={false} pose="idle" />
                <span>BrowserBash</span>
            </a>
            <h1 className="authpage__title">Welcome back</h1>
            <p className="authpage__sub">Free, open source. Log in to see your runs and recordings.</p>
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
                <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/dashboard" />
            ) : (
                <p className="authpage__sub">Sign-in is not configured in this environment.</p>
            )}
        </main>
    );
}
