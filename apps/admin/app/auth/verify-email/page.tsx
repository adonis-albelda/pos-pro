import Image from "next/image";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { ParticleField } from "@/components/particle-field";
import { VerifyEmailStatus } from "./verify-email-status";

/**
 * Where a new admin/manager's verification email actually lands — see
 * AppServiceProvider's VerifyEmail::createUrlUsing override on the backend,
 * which points here instead of at the raw signed API route. Server
 * Component shell reading searchParams (same reason login/page.tsx does:
 * useSearchParams + a client "use client" boundary trips the root error.tsx
 * during prerender), actual verify call happens client-side in the child.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; hash?: string; expires?: string; signature?: string }>;
}) {
  const { id, hash, expires, signature } = await searchParams;

  return (
    <main className="relative flex min-h-screen bg-paper">
      <AuthBrandPanel />

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
            <VerifyEmailStatus id={id} hash={hash} expires={expires} signature={signature} />
          </div>

          <p className="mt-8 text-center text-caption text-ink-muted">
            Copyright © 2026 POSPro - All Rights Reserved.
          </p>
        </div>
      </div>
    </main>
  );
}
