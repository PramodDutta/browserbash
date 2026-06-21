'use client';

import { useAuth, UserButton } from '@clerk/nextjs';

/**
 * Auth-aware nav buttons as a client island, so the landing page can stay
 * statically rendered + CDN-cached (no server-side auth() call that would make
 * the whole page dynamic). Anonymous and pre-load states show the sign-in CTAs
 * — matching the static HTML, so no flicker for the common visitor. Once Clerk
 * confirms a session, it swaps to a Dashboard link + the user menu, so a
 * logged-in user who lands on the home page never sees "Log in" and think their
 * login failed.
 */
export function NavAuth() {
    const { isLoaded, isSignedIn } = useAuth();

    if (isLoaded && isSignedIn) {
        return (
            <>
                <a className="pixel-btn nav__signup" href="/dashboard">Dashboard</a>
                <UserButton />
            </>
        );
    }

    return (
        <>
            <a className="pixel-btn ghost nav__login" href="/sign-in">Log in</a>
            <a className="pixel-btn nav__signup" href="/sign-up">Sign up free</a>
        </>
    );
}
