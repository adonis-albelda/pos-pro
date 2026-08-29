import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { Search, Sparkles, TriangleAlert, X } from "lucide-react-native";
import { ApiError, type ApiClient } from "@double-a/api-client";
import { vectorSearchProducts } from "@double-a/api-client/queries";
import { Button } from "@/components/ui";
import { color, fontSize, space } from "@/theme";

type Phase = "input" | "processing" | "error";

/**
 * Meaning-based product search — types a query, server embeds it (OpenAI /
 * Laravel AI) and ranks the catalogue by similarity. Online-only (the match
 * itself has to happen server-side); the caller re-reads matched ids from
 * local SQLite, same as everywhere else the offline product list is filled.
 */
export function AiSearchModal({
  open,
  onClose,
  onResult,
  client,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (productIds: string[], label: string) => void;
  client: ApiClient;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("input");
    setQuery("");
    setErrorMessage(null);
  }, [open]);

  async function submit() {
    const needle = query.trim();
    if (!needle) return;

    Keyboard.dismiss();
    setPhase("processing");

    try {
      const results = await vectorSearchProducts(client, needle);
      if (results.length === 0) {
        setPhase("error");
        setErrorMessage("Nothing matched that. Try different words.");
        return;
      }
      onResult(results.map((r) => r.id), needle);
      onClose();
    } catch (error) {
      setPhase("error");
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Could not reach the server. Check the connection and try again.",
      );
    }
  }

  function retry() {
    setPhase("input");
    setErrorMessage(null);
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: `${color.ink}99`,
          alignItems: "center",
          justifyContent: "center",
          padding: space.xl,
        }}
      >
        {phase === "input" ? (
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            style={{ position: "absolute", inset: 0 }}
          />
        ) : null}

        <View
          style={{
            width: "100%",
            maxWidth: 380,
            borderRadius: 24,
            backgroundColor: color.surface,
            borderWidth: 1,
            borderColor: color.borderSoft,
            paddingVertical: space["2xl"],
            paddingHorizontal: space.xl,
            alignItems: "center",
            gap: space.lg,
            shadowColor: "#000",
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 14,
          }}
        >
          {phase === "processing" ? (
            <>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: color.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator color={color.primary} size="large" />
              </View>
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                AI is processing the request
              </Text>
              <Text
                numberOfLines={2}
                style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}
              >
                Matching “{query.trim()}” against the catalogue…
              </Text>
            </>
          ) : phase === "error" ? (
            <>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: color.dangerSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TriangleAlert size={32} color={color.dangerInk} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                Smart search
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                {errorMessage}
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm, width: "100%" }}>
                <Button label="Try again" onPress={retry} style={{ flex: 1, borderRadius: 14 }} />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={onClose}
                  style={{ flex: 1, borderRadius: 14 }}
                />
              </View>
            </>
          ) : (
            <>
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: color.primarySoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Sparkles size={30} color={color.primary} strokeWidth={2} />
              </View>
              <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
                Smart search
              </Text>
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                Describe what you're looking for — brand, use, or a rough name.
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: space.sm,
                  width: "100%",
                  minHeight: 52,
                  borderWidth: 2,
                  borderColor: color.primary,
                  borderRadius: 14,
                  paddingHorizontal: space.md,
                }}
              >
                <Search size={18} color={color.inkMuted} strokeWidth={2} />
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => void submit()}
                  autoFocus
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="e.g. “blue paint for wood”"
                  placeholderTextColor={color.inkMuted}
                  style={{ flex: 1, fontSize: fontSize.bodyLg, color: color.ink }}
                />
                {query ? (
                  <Pressable
                    onPress={() => setQuery("")}
                    accessibilityRole="button"
                    accessibilityLabel="Clear"
                    hitSlop={4}
                  >
                    <X size={18} color={color.inkMuted} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>

              <View style={{ flexDirection: "row", gap: space.sm, width: "100%" }}>
                <Button
                  label="Search"
                  icon={Sparkles}
                  disabled={!query.trim()}
                  onPress={() => void submit()}
                  style={{ flex: 1, borderRadius: 14 }}
                />
                <Button
                  label="Cancel"
                  variant="secondary"
                  onPress={onClose}
                  style={{ flex: 1, borderRadius: 14 }}
                />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
