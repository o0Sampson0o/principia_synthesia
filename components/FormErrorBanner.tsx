/**
 * Server-rendered error note for form pages using the redirect-with-
 * `?error=` pattern. Pass the already-resolved human message (pages own
 * their code → message maps); renders nothing when there is no error.
 */
export default function FormErrorBanner({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-6 themed-surface border themed-border rounded-lg px-4 py-3 text-sm"
    >
      <p className="mb-1 ps-mono-micro" style={{ color: "var(--color-error)" }}>
        Not saved
      </p>
      <p className="themed-secondary">{message}</p>
    </div>
  );
}
