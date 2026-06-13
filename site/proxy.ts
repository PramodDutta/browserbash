import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

// Hero A/B: assign a sticky 50/50 variant cookie on first visit so the
// server-rendered landing page can pick a variant without client flicker.
function assignHero(req: NextRequest, res: NextResponse): NextResponse {
    if (!req.cookies.get('bb_hero')) {
        res.cookies.set('bb_hero', Math.random() < 0.5 ? 'b' : 'a', {
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
            sameSite: 'lax',
        });
    }
    return res;
}

// Next 16: middleware is called proxy. Clerk only engages when keys are
// configured, so the public site builds and runs without them.
// NOTE: /api/runs is deliberately absent — its POST authenticates CLI calls
// with a Bearer API key (no browser session); both handlers self-auth.
const isProtected = createRouteMatcher(['/dashboard(.*)', '/api/onboarding', '/api/keys']);
const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default hasClerk
    ? clerkMiddleware(async (auth, req) => {
          if (isProtected(req)) await auth.protect();
          return assignHero(req, NextResponse.next());
      })
    : function proxy(req: NextRequest) {
          return assignHero(req, NextResponse.next());
      };

export const config = {
    matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
