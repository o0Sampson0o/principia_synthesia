"use client";

import { useState, useTransition } from "react";
import { updateDisplayName, changePassword, type ActionResult } from "./actions";

function Feedback({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className="mt-2"
      style={{
        fontSize: "0.8125rem",
        color: result.ok
          ? "var(--color-success-border, #15803d)"
          : "var(--color-warning-border, #b45309)",
      }}
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

export default function AccountEditor({ initialDisplayName }: { initialDisplayName: string }) {
  const [isPending, startTransition] = useTransition();
  const [nameResult, setNameResult] = useState<ActionResult | null>(null);
  const [pwResult, setPwResult] = useState<ActionResult | null>(null);

  function handleName(formData: FormData) {
    setNameResult(null);
    startTransition(async () => setNameResult(await updateDisplayName(formData)));
  }

  function handlePassword(formData: FormData) {
    setPwResult(null);
    startTransition(async () => {
      const result = await changePassword(formData);
      setPwResult(result);
      if (result.ok) {
        (document.getElementById("account-password-form") as HTMLFormElement | null)?.reset();
      }
    });
  }

  return (
    <div className="space-y-12">
      {/* ── Display name ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">Display name</p>
        </div>
        <p className="themed-muted mb-4" style={{ fontSize: "0.8125rem", lineHeight: 1.6 }}>
          Shown on your publisher page and in bylines.
        </p>
        <form action={handleName} className="flex flex-col sm:flex-row gap-3">
          <input
            name="displayName"
            defaultValue={initialDisplayName}
            required
            maxLength={100}
            className="themed-input rounded-lg flex-1"
            style={{ fontSize: "0.875rem", padding: "0.5rem 0.75rem" }}
          />
          <button
            type="submit"
            disabled={isPending}
            className="themed-btn-primary rounded-lg"
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            Save
          </button>
        </form>
        <Feedback result={nameResult} />
      </section>

      {/* ── Password ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between pb-3 border-b themed-border mb-4">
          <p className="ps-eyebrow-muted">Password</p>
        </div>
        <form id="account-password-form" action={handlePassword} className="space-y-3 max-w-sm">
          <input
            type="password"
            name="currentPassword"
            required
            autoComplete="current-password"
            placeholder="Current password"
            className="themed-input rounded-lg w-full"
            style={{ fontSize: "0.875rem", padding: "0.5rem 0.75rem" }}
          />
          <input
            type="password"
            name="newPassword"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="New password (min 8 characters)"
            className="themed-input rounded-lg w-full"
            style={{ fontSize: "0.875rem", padding: "0.5rem 0.75rem" }}
          />
          <button
            type="submit"
            disabled={isPending}
            className="themed-btn-primary rounded-lg"
            style={{ fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            Change password
          </button>
        </form>
        <Feedback result={pwResult} />
      </section>
    </div>
  );
}
