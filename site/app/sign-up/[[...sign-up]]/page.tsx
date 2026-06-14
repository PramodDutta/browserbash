import type { Metadata } from 'next';
import { SignUp } from '@clerk/nextjs';
import { Bo } from '@/components/Bo';
import { TrackEvent } from '@/components/TrackEvent';
import '../../landing.css';
import '../../auth.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Sign up free — BrowserBash',
    description: 'Create a free BrowserBash account. Open-source, natural-language browser automation — run history, video recordings and per-run replays on your dashboard.',
    robots: { index: false, follow: true },
};

export default function Page() {
    return (
        <main className="authpage container">
            <TrackEvent name="sign_up_view" />
            <a href="/" className="authpage__brand">
                <Bo size={30} interactive={false} pose="idle" />
                <span>BrowserBash</span>
            </a>
            <h1 className="authpage__title">Create your free account</h1>
            <p className="authpage__sub">No credit card. Free and open source — the CLI stays free forever.</p>
            {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
                <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/dashboard" />
            ) : (
                <p className="authpage__sub">Sign-up is not configured in this environment.</p>
            )}
        </main>
    );
}
