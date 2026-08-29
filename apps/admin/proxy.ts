import { NextResponse, type NextRequest } from "next/server";
import { ApiClient, ApiError, assertApiUrl } from "@double-a/api-client";
import { me } from "@double-a/api-client/queries";
import { ACTING_COMPANY_COOKIE, SESSION_COOKIE } from "@/lib/api/cookie-names";

const PUBLIC_PATHS = ["/login", "/auth"];

/**
 * Refreshes-in-place is no longer a concept (Sanctum tokens aren't renewed
 * client-side the way a Supabase JWT was) — this just gates routes off
 * whatever `GET /auth/me` says about the current session cookie, every
 * navigation. Fine — apps/admin assumes constant connectivity (CLAUDE.md §5).
 */
export default async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((publicPath) => path.startsWith(publicPath));
  const isChangePassword = path.startsWith("/change-password");
  const isEnrollMfa = path.startsWith("/enroll-mfa");
  const isPlatform = path.startsWith("/platform");

  const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
  const acting = Boolean(request.cookies.get(ACTING_COMPANY_COOKIE)?.value);

  let user: Awaited<ReturnType<typeof me>> | null = null;
  if (token) {
    try {
      const client = new ApiClient({
        baseUrl: assertApiUrl(process.env.NEXT_PUBLIC_TALLY_API_URL, "NEXT_PUBLIC_TALLY_API_URL"),
        getToken: () => token,
      });
      user = await me(client);
    } catch (error) {
      // A 401/403 genuinely means "not signed in" — user stays null and the
      // redirect logic below runs as normal. Anything else (a network blip,
      // a transient 500 from the API, a timeout) is not something middleware
      // should crash the whole app over — this runs on every navigation,
      // before any React tree exists, so a thrown error here never reaches
      // error.tsx/global-error.tsx at all; it was surfacing as a raw,
      // unstyled "Internal Server Error" on whatever page the user happened
      // to be navigating to when the API hiccuped. Let the request through
      // un-gated instead — the page's own data fetching hits the same API
      // call again and, if it's still failing, surfaces a normal in-page
      // error our error boundaries do catch.
      if (!(error instanceof ApiError && (error.isUnauthenticated || error.isForbidden))) {
        return NextResponse.next({ request });
      }
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (user && !isPublic) {
    const home = user.role === "superadmin" && !acting ? "/platform" : "/";

    // Takes priority over mustChangePassword: without a confirmed MFA
    // secret this account can never produce a valid mfa_code on its next
    // login, so it has to be resolved before anything else, same ordering
    // login-form.tsx's own onSuccess redirect uses.
    if (user.mustEnrollMfa && !isEnrollMfa) {
      const url = request.nextUrl.clone();
      url.pathname = "/enroll-mfa";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (!user.mustEnrollMfa && isEnrollMfa) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (user.mustChangePassword && !isChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (!user.mustChangePassword && isChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (user.role === "superadmin" && !acting && !isPlatform && !isChangePassword) {
      const url = request.nextUrl.clone();
      url.pathname = "/platform";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (user.role === "admin" && isPlatform) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = user.role === "superadmin" && !acting ? "/platform" : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
