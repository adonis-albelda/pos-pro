"use client";

import { MfaEnrollFlow } from "@/components/mfa-enroll-flow";

export function EnrollMfaForm() {
  return (
    <MfaEnrollFlow
      onDone={() => {
        // Hard navigation — same reason as change-password-form.tsx: proxy.ts
        // must re-evaluate must_enroll_mfa against a fresh /auth/me, not a
        // stale Router Cache render from before it flipped.
        window.location.href = "/";
      }}
    />
  );
}
