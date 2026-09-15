import Image from "next/image";
import { CheckCircle2 } from "lucide-react";
import { RotatingTagline } from "@/app/login/rotating-tagline";
import { ParticleField } from "@/components/particle-field";

const TAGLINES = [
  "Run your store smarter, from the counter to the back office.",
  "One system for every terminal, every shift, every sale.",
  "Sell offline. Sync when you're ready. Never lose a sale.",
  "Know your margins the moment a sale is rung up.",
  "Stock, suppliers, and cashiers — one dashboard.",
];

const FEATURES = [
  "Real-time sales tracking across every terminal",
  "Inventory that updates itself as stock moves",
  "Cashier accounts, PIN unlock, and shift history",
  "Bluetooth printer support for instant receipts",
  "Custom receipt layout, footer, and branding",
  "Voice search to find and add products hands-free",
  "Reports and margins, always up to date",
  "Purchase orders and supplier payment terms",
  "Customer accounts with delivery tracking",
  "Expense logging and true net profit, not just gross",
  "Runs the floor even when the internet doesn't",
];

/** Left brand panel — shared by every auth screen (login, change-password)
 * so they read as one system. 55% wide, hidden below lg: the form is what
 * matters on a phone. Straight edge, flat bg-primary — the wave-seam
 * experiment is retired. */
export function AuthBrandPanel() {
  return (
    <div className="relative hidden w-[55%] flex-col justify-between overflow-hidden bg-primary p-12 lg:flex">
      {/* Soft floating accents — flat color alone read a little bare next to
          the elevated card on the right, this gives the panel its own depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-white/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 -left-24 size-72 rounded-full bg-accent/20 blur-3xl"
      />

      <ParticleField color="#ffffff" />

      <div className="relative space-y-4 pb-0">
        <div className="motion-safe:animate-feature-in flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-white shadow-sm">
            <Image src="/logo.png" alt="" width={28} height={28} className="size-7 object-contain" />
          </div>
          <span className="font-display text-heading-sm font-bold text-white">POSPro One</span>
        </div>
        <div className="max-w-md space-y-14">
          <RotatingTagline lines={TAGLINES} />
          <div className="relative max-w-md space-y-3 mt-4">
            <ul className="space-y-3">
              {FEATURES.map((feature, index) => (
                <li
                  key={feature}
                  className="motion-safe:animate-feature-in flex items-start gap-3"
                  style={{ animationDelay: `${120 + index * 90}ms` }}
                >
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <CheckCircle2 className="size-3.5 text-white" />
                  </span>
                  <span className="text-body-lg text-white/90">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="relative text-caption text-white/60">
        Copyright © 2026 POSPro One - All Rights Reserved.
      </p>
    </div>
  );
}
