import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br from-plum-700 to-plum-900 text-2xl font-black text-white shadow-lg">
          D
        </div>
        <h1 className="text-3xl font-black tracking-tight text-ink">DINX</h1>
        <p className="mt-2 text-sm text-muted">
          One budget, two people. Expenses, income, bills and savings — from the 25th to the 25th.
        </p>
      </div>

      <LoginForm nextPath={next ?? "/"} initialError={authErrorMessage(error)} />
    </main>
  );
}

/** Turns a callback error code into something worth reading. */
function authErrorMessage(error?: string): string | null {
  if (!error) return null;
  if (error === "missing_code") {
    return "That confirmation link was incomplete. Try signing in, or request a new link.";
  }
  // Opening the link on a different device than you signed up on is the most
  // common cause — the PKCE verifier lives in the original browser.
  return `${error}. If you opened the confirmation link on another device, sign up again and open it on this one.`;
}
