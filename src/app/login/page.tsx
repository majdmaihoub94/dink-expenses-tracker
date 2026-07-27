import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

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

      <LoginForm nextPath={next ?? "/"} />
    </main>
  );
}
