export default function CheckEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center themed-bg themed-text px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p className="themed-muted-text">
          We sent a verification link to your email address. Click the link to
          activate your account.
        </p>
        <p className="themed-muted-text text-sm">
          The link expires in 24 hours. If you don&apos;t see the email, check
          your spam folder.
        </p>
      </div>
    </main>
  );
}
