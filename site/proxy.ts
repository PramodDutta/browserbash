import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// Next 16: middleware is called proxy. Clerk only engages when keys are
// configured, so the public site builds and runs without them.
// NOTE: /api/runs is deliberately absent — its POST authenticates CLI calls
// with a Bearer API key (no browser session); both handlers self-auth.
const isProtected = createRouteMatcher(['/dashboard(.*)', '/api/export', '/api/onboarding', '/api/keys']);
const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default hasClerk
    ? clerkMiddleware(async (auth, req) => {
          if (isProtected(req)) await auth.protect();
      })
    : function proxy() {
          return NextResponse.next();
      };

export const config = {
    matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
