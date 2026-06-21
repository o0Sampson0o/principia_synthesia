export default function CheckEmailPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="max-w-md w-full text-center">
        <p className="ps-eyebrow mb-4">Sign up</p>
        <h1 className="ps-display themed-heading mb-5" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
          Check your inbox
        </h1>
        <p className="themed-muted mb-3" style={{ fontSize: "0.9375rem", lineHeight: 1.7 }}>
          We sent a verification link to your email address. Click the link to
          activate your account.
        </p>
        <p className="themed-muted" style={{ fontSize: "0.875rem" }}>
          The link expires in 24 hours. If you don&apos;t see the email, check
          your spam folder.
        </p>
      </div>
    </main>
  );
}
