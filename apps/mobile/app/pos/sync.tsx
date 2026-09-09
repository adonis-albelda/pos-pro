import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { timeAgo } from "@double-a/shared-types";
import { CloudUpload, DatabaseZap, RefreshCw, Smartphone } from "lucide-react-native";
import { getSyncMeta } from "@/db/meta";
import { countLocalProducts } from "@/db/products";
import { countPendingSales } from "@/db/sales";
import { countLocalUsers } from "@/db/users";
import { useLayout } from "@/lib/layout";
import { useSync } from "@/sync/sync-provider";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { Badge, Card, ErrorNote, LedgerLine, SectionTitle } from "@/components/ui";
import { color, fontSize, radius, space, styles } from "@/theme";

/**
 * One card, flat — status on top, the three actions below it as plain rows
 * separated by a ledger line each, not one card per action. Matches how a
 * receipt or a settings sheet reads: a single surface, not a stack of tiles.
 */
export default function SyncScreen() {
  const layout = useLayout();
  const { dataVersion, error, phase, pendingSales, sync, pullOnly, replaceAll } = useSync();

  const [info, setInfo] = useState({
    products: 0,
    users: 0,
    pending: 0,
    lastSyncedAt: null as string | null,
  });

  useEffect(() => {
    async function load() {
      const [products, users, pending, meta] = await Promise.all([
        countLocalProducts(),
        countLocalUsers(),
        countPendingSales(),
        getSyncMeta(),
      ]);

      setInfo({ products, users, pending, lastSyncedAt: meta.lastSyncedAt });
    }

    void load();
    // Every count here is stale the moment a pull finishes.
  }, [dataVersion]);

  const busy = phase === "pushing" || phase === "pulling";

  function confirmReplaceAll() {
    Alert.alert(
      "Replace everything?",
      "Drops every product and cashier held on this terminal and re-downloads all of it fresh. Use this only if local data looks wrong — Sync and Pull data are cheaper and enough for everyday use.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Replace everything", style: "destructive", onPress: () => void replaceAll() },
      ],
    );
  }

  return (
    <View style={styles.screen}>
      <WaveBackdrop />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space.lg,
          width: "100%",
          maxWidth: layout.readableMaxWidth,
          alignSelf: "center",
        }}
      >
        {phase === "failed" && error ? <ErrorNote>{error}</ErrorNote> : null}

        <Card style={[{ gap: space.sm }, styles.floatShadow, { borderRadius: radius.sm }]}>
          <SectionTitle icon={Smartphone} title="On this terminal" />
          <Row label="Last synced" value={timeAgo(info.lastSyncedAt)} />
          <Row label="Sales waiting to send" value={String(info.pending)} />
          <Row label="Products held" value={String(info.products)} />
          <Row label="Cashiers held" value={String(info.users)} />
          {info.pending > 0 ? (
            <Badge tone="warning" label={`${info.pending} not sent yet`} />
          ) : (
            <Badge tone="success" label="All sales sent" />
          )}

          <LedgerLine />

          <ActionLine
            icon={CloudUpload}
            tone="accent"
            title="Sync"
            body="Sends every sale still on this terminal, then brings down the latest prices, products and cashiers. If sending fails, nothing is fetched and the sales stay here for the next attempt. This is the only action that sends sales."
            buttonLabel={busy && phase === "pushing" ? "Syncing…" : "Sync"}
            busy={busy}
            onPress={() => void sync()}
          />

          <LedgerLine />

          <ActionLine
            icon={RefreshCw}
            tone="primary"
            title="Pull data"
            body="Only brings changes down — a price or product edited in the office lands here within seconds. Use it mid-shift without sending sales. Sales stay put and go out on the next Sync."
            buttonLabel={busy ? "Working…" : "Pull"}
            busy={busy}
            onPress={() => void pullOnly()}
          />

          <LedgerLine />

          <ActionLine
            icon={DatabaseZap}
            tone="warning"
            title="Replace everything"
            body="Drops every product and cashier held here and re-downloads all of it from scratch, instead of only what changed. Slower and heavier than the two actions above — for when local data looks wrong, not routine use."
            buttonLabel={busy ? "Working…" : "Replace"}
            busy={busy}
            onPress={confirmReplaceAll}
          />
        </Card>

        <Text style={[styles.muted, { textAlign: "center", color: color.onPrimary }]}>
          Nothing here runs on its own. Selling and printing work exactly the
          same with no connection at all
          {pendingSales > 0 ? ` — ${pendingSales} sale${pendingSales === 1 ? "" : "s"} waiting on Sync.` : "."}
        </Text>
      </ScrollView>
    </View>
  );
}

type SyncTone = "accent" | "primary" | "warning";

// Functions, not module-level constants — a plain object here would read
// color.primary/color.accent/etc. exactly once at import, before caching
// forever, and never pick up a later Theme menu pick. See components/ui.tsx's
// buttonFill for the same fix on the shared Button.
function toneColor(tone: SyncTone): string {
  const colors: Record<SyncTone, string> = {
    accent: color.accent,
    primary: color.primary,
    warning: color.warning,
  };
  return colors[tone];
}

// Amber tones (accent, warning) are too light for white button text.
function toneOnColor(tone: SyncTone): string {
  const colors: Record<SyncTone, string> = {
    accent: color.ink,
    primary: color.onPrimary,
    warning: color.ink,
  };
  return colors[tone];
}

/** A flat row inside the one card — icon, title, button on the right, description below. Not its own card. */
function ActionLine({
  icon: Icon,
  tone,
  title,
  body,
  buttonLabel,
  busy,
  onPress,
}: {
  icon: typeof CloudUpload;
  tone: SyncTone;
  title: string;
  body: string;
  buttonLabel: string;
  busy: boolean;
  onPress: () => void;
}) {
  const tint = toneColor(tone);
  const onTint = toneOnColor(tone);

  return (
    <View style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon size={18} color={tint} strokeWidth={2} />
        <Text
          numberOfLines={1}
          style={{ flex: 1, fontSize: fontSize.body, fontWeight: "700", color: color.ink }}
        >
          {title}
        </Text>

        <Pressable
          onPress={onPress}
          disabled={busy}
          style={({ pressed }) => ({
            minHeight: 40,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: space.md,
            borderRadius: radius.sm,
            backgroundColor: tint,
            opacity: busy ? 0.6 : pressed ? 0.85 : 1,
          })}
        >
          <Text numberOfLines={1} style={{ fontSize: fontSize.body, fontWeight: "700", color: onTint }}>
            {buttonLabel}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.muted}>{body}</Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.numeric, { fontSize: fontSize.body }]}>{value}</Text>
    </View>
  );
}
