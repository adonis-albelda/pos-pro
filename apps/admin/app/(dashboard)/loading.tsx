import Image from "next/image";
import { Loader2 } from "lucide-react";

/**
 * Next's route-segment Suspense fallback — shows while DashboardLayout awaits
 * getCurrentUser/getStoreSettings/getUiMode (first load, hard refresh, or a
 * nav into a route with its own async data). Same bg-paper as the dashboard
 * itself, not a branded takeover — this is a beat, not a screen.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6">
      <div className="flex size-14 items-center justify-center rounded-xl bg-primary-soft">
        <Image src="/logo.png" alt="" width={32} height={32} className="size-8 object-contain" />
      </div>
      <div className="text-center">
        <p className="text-heading-sm font-bold text-ink">POSPro One</p>
        <p className="mt-1 text-body text-ink-muted">
          Sales, inventory, and cashiers — everything your store needs, in one place.
        </p>
      </div>
      <div className="flex items-center gap-2 text-caption text-ink-muted">
        <Loader2 size={14} strokeWidth={2} className="animate-spin" />
        Preparing…
      </div>
    </div>
  );
}
