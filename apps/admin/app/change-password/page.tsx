"use client";

import Image from "next/image";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { ParticleField } from "@/components/particle-field";
import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
  return (
    <main className="relative flex min-h-screen bg-paper">
      <AuthBrandPanel />

      {/* Right — the form, 45% wide, same shell as the login page's card. */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-paper px-6 py-12 lg:w-[45%] lg:flex-none">
        <ParticleField color="var(--color-primary)" />

        <div className="relative w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary-soft">
              <Image src="/logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
            </div>
            <div>
              <h1 className="text-heading-md font-bold text-ink">POSPro</h1>
              <p className="text-caption text-ink-muted">Admin dashboard</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-surface p-8 shadow-lg shadow-ink/5">
            <h2 className="text-heading-lg font-bold text-ink">Choose a new password</h2>
            <p className="mt-2 text-body text-ink-muted">
              Your account requires a password change before you can use the dashboard.
            </p>

            <div className="mt-8">
              <ChangePasswordForm />
            </div>
          </div>

          <p className="mt-8 text-center text-caption text-ink-muted">
            Copyright © 2026 POSPro - All Rights Reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
