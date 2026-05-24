import Link from "next/link";
import { redirect } from "next/navigation";
import { confirmVerification } from "./actions";

export default async function VerifyEmailPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center themed-bg themed-text px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold">Verify your email address</h1>
        <p className="themed-muted-text">
          Click the button below to confirm your email address and activate your
          account.
        </p>
        <form action={confirmVerification}>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="themed-btn-primary">
            Verify email
          </button>
        </form>
        <p className="text-sm themed-muted-text">
          Wrong browser?{" "}
          <Link href="/login" className="themed-link">
            Sign in instead
          </Link>
        </p>
      </div>
    </main>
  );
}
