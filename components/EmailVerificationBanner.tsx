"use client";

import { useState } from "react";
import { resendVerificationEmailAction } from "@/app/signup/resend-verification-action";

type Props = {
  email: string;
};

export default function EmailVerificationBanner({ email }: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleResend() {
    setStatus("sending");
    try {
      const result = await resendVerificationEmailAction();
      setStatus(result.sent ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      role="alert"
      className="w-full bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 flex flex-wrap items-center gap-x-3 gap-y-1"
    >
      <span>
        Your email address <strong>{email}</strong> is not verified. Some
        features are restricted until you verify.
      </span>
      {status === "idle" && (
        <button
          onClick={handleResend}
          className="underline underline-offset-2 hover:no-underline font-medium"
        >
          Resend verification email
        </button>
      )}
      {status === "sending" && (
        <span className="opacity-70">Sending&hellip;</span>
      )}
      {status === "sent" && (
        <span className="font-medium">
          Verification email sent. Check your inbox.
        </span>
      )}
      {status === "error" && (
        <button
          onClick={handleResend}
          className="underline underline-offset-2 hover:no-underline font-medium"
        >
          Failed to send. Try again.
        </button>
      )}
    </div>
  );
}
