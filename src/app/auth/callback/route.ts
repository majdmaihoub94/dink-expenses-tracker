import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Behind Railway's proxy `request.url` carries the internal host, which would
 * send the user to an unreachable address. Trust the forwarded headers, which
 * the proxy sets, and fall back to the request's own origin locally.
 */
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host");
  if (!host) return new URL(request.url).origin;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Exchanges the email-confirmation / magic-link code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = publicOrigin(request);

  const code = searchParams.get("code");
  // Only allow relative paths, so the callback can't be used as an open
  // redirect to another site.
  const requested = searchParams.get("next") ?? "/";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);

    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  return NextResponse.redirect(`${origin}/login?error=missing_code`);
}
