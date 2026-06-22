import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

// Hero A/B: assign a sticky 50/50 variant cookie on first visit so the
// server-rendered landing page can pick a variant without client flicker.
// Canonical host is the apex. The www host currently serves 200 (duplicate
// surface); 308 it to apex so crawl budget + signals stay consolidated.
function wwwToApex(req: NextRequest): NextResponse | null {
    if (req.headers.get('host') === 'www.browserbash.com') {
        const url = new URL(req.url);
        url.host = 'browserbash.com';
        return NextResponse.redirect(url, 308);
    }
    return null;
}

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
// Page routes get an HTML redirect to /sign-in when signed out; the protected
// /api/* routes keep the default (notFound/401) so JSON callers aren't bounced
// to a sign-in page.
const isProtectedPage = createRouteMatcher(['/dashboard(.*)']);
const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default hasClerk
    ? clerkMiddleware(async (auth, req) => {
          const wwwRedirect = wwwToApex(req);
          if (wwwRedirect) return wwwRedirect;
          if (isProtected(req)) {
              // A signed-out visitor to /dashboard must be redirected to /sign-in,
              // not 404'd. Without unauthenticatedUrl, protect() throws notFound()
              // (the current 404). unauthenticatedUrl requires an absolute URL, so
              // resolve /sign-in against the incoming request.
              await auth.protect(
                  isProtectedPage(req)
                      ? { unauthenticatedUrl: new URL('/sign-in', req.url).toString() }
                      : undefined,
              );
          }
          return assignHero(req, NextResponse.next());
      })
    : function proxy(req: NextRequest) {
          const wwwRedirect = wwwToApex(req);
          if (wwwRedirect) return wwwRedirect;
          return assignHero(req, NextResponse.next());
      };

export const config = {
    matcher: ['/((?!_next|.*\\..*).*)', '/(api|trpc)(.*)'],
};
