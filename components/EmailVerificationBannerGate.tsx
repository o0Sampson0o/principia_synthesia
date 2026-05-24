"use client";

import { usePathname } from "next/navigation";
import EmailVerificationBanner from "./EmailVerificationBanner";

const SUPPRESS_PREFIXES = ["/login", "/signup", "/verify-email", "/invitations"];

export default function EmailVerificationBannerGate({ email }: { email: string }) {
  const path = usePathname();
  if (SUPPRESS_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return null;
  }
  return <EmailVerificationBanner email={email} />;
}
