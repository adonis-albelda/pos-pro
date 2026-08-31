import { getStoreSettings } from "@double-a/api-client/queries";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";
import { ClassicShell } from "@/components/classic-shell";
import { DashboardShell } from "@/components/dashboard-shell";
import { DemoSessionBanner } from "@/components/demo-session-banner";
import { HydrateStoreSettings } from "@/components/hydrate-store-settings";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { LocationFilterProvider } from "@/components/location-filter-provider";
import { PushNotificationRegistrar } from "@/components/push-notification-registrar";
import { getUiMode, isAdminEmbedded } from "@/lib/ui-mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, store, mode, embedded] = await Promise.all([
    getCurrentUser(),
    getStoreSettings(getAuthedClient()),
    getUiMode(),
    isAdminEmbedded(),
  ]);

  const initials = (user?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const content =
    user?.role === "superadmin" ? (
      <>
        <ImpersonationBanner storeName={store.name} />
        {children}
      </>
    ) : (
      children
    );

  const contentWithPush = (
    <>
      <HydrateStoreSettings store={store} />
      <PushNotificationRegistrar />
      {content}
    </>
  );

  if (mode === "classic") {
    return (
      <LocationFilterProvider>
        <DemoSessionBanner />
        <ClassicShell
          storeName={store.name}
          storeLogoUrl={store.logoUrl}
          userName={user?.name ?? null}
          userEmail={user?.email ?? null}
          mode={mode}
          embedded={embedded}
        >
          {contentWithPush}
        </ClassicShell>
      </LocationFilterProvider>
    );
  }

  return (
    <LocationFilterProvider>
      <DemoSessionBanner />
      <DashboardShell
        storeName={store.name}
        storeLogoUrl={store.logoUrl}
        userName={user?.name ?? null}
        userEmail={user?.email ?? null}
        initials={initials}
        mode={mode}
        embedded={embedded}
      >
        {contentWithPush}
      </DashboardShell>
    </LocationFilterProvider>
  );
}
