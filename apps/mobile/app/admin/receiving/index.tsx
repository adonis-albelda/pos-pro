import { useEffect, useRef, useState } from "react";
import { Image, PanResponder, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Clock,
  Crop,
  FolderOpen,
  Images,
  PackageCheck,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react-native";
import { roundMoney } from "@double-a/shared-types";
import {
  createGoodsReceipt,
  extractGoodsReceiptPhoto,
  type ExtractedReceiptLine,
} from "@double-a/api-client/queries";
import { getAdminApiClient } from "@/lib/api/session";
import { useLocationScope } from "@/lib/location-scope";
import { useGalleryPhotos, useUploadGalleryPhoto } from "@/lib/query/gallery-photos";
import { useSuppliers } from "@/lib/query/suppliers";
import { Badge, Button, Card, ErrorNote, IconButton, SuccessNote } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { DocumentScanCameraModal } from "@/components/document-scan-camera-modal";
import { WaveBackdrop } from "@/components/wave-backdrop";
import { color, fontSize, radius, space, styles } from "@/theme";

function newKey(): string {
  return Math.random().toString(36).slice(2);
}

/** RN's fetch/FormData accepts this file shape at runtime; api-client's types assume the web File. */
function toUploadFile(uri: string): File {
  return { uri, name: "receipt.jpg", type: "image/jpeg" } as unknown as File;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Same object-contain letterboxing math as apps/admin's crop-photo.tsx, just fed RN measurements instead of DOM ones. */
function getRenderedImageMetrics(
  naturalWidth: number,
  naturalHeight: number,
  containerWidth: number,
  containerHeight: number,
) {
  if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) {
    return { offsetX: 0, offsetY: 0, width: containerWidth, height: containerHeight, scale: 1 };
  }

  const naturalAspect = naturalWidth / naturalHeight;
  const containerAspect = containerWidth / containerHeight;

  let width: number;
  let height: number;
  let offsetX: number;
  let offsetY: number;

  if (naturalAspect > containerAspect) {
    width = containerWidth;
    height = containerWidth / naturalAspect;
    offsetX = 0;
    offsetY = (containerHeight - height) / 2;
  } else {
    height = containerHeight;
    width = containerHeight * naturalAspect;
    offsetX = (containerWidth - width) / 2;
    offsetY = 0;
  }

  return { offsetX, offsetY, width, height, scale: naturalWidth / width };
}

const EDITOR_HEIGHT = 380;

/**
 * Native counterpart to apps/admin's from-photo/crop-photo.tsx — no
 * canvas/DOM here, so rotate/crop both go through expo-image-manipulator
 * instead. Same one-rectangle, no-resize-handles crop, same rotate-in-place
 * re-render loop. Never touches the original file the caller holds; hands
 * back a brand new uri either way.
 */
function PhotoCropEditor({
  uri,
  onDone,
  onCancel,
}: {
  uri: string;
  onDone: (uri: string) => void;
  onCancel: () => void;
}) {
  const [displayUri, setDisplayUri] = useState(uri);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [container, setContainer] = useState<{ width: number; height: number } | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [rotating, setRotating] = useState(false);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      displayUri,
      (width, height) => {
        if (!cancelled) setNatural({ width, height });
      },
      () => {
        if (!cancelled) setError("Could not read this image.");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [displayUri]);

  const metrics =
    natural && container
      ? getRenderedImageMetrics(natural.width, natural.height, container.width, container.height)
      : null;

  // Recreated every render (cheap plain object) rather than memoized once —
  // the handlers below need to close over the latest `container` state, and
  // a one-time useRef(...).current would freeze them on the first render's
  // (null) container, silently breaking drag before it ever moves the rect.
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const { locationX, locationY } = event.nativeEvent;
      dragStart.current = { x: locationX, y: locationY };
      setRect({ x: locationX, y: locationY, width: 0, height: 0 });
    },
    onPanResponderMove: (event) => {
      if (!dragStart.current || !container) return;
      const { locationX, locationY } = event.nativeEvent;
      const clamped = {
        x: Math.min(Math.max(locationX, 0), container.width),
        y: Math.min(Math.max(locationY, 0), container.height),
      };
      setRect(normalizeRect(dragStart.current, clamped));
    },
    onPanResponderRelease: () => {
      dragStart.current = null;
    },
  });

  async function rotate() {
    if (rotating) return;
    setRotating(true);
    setError(null);
    try {
      const result = await ImageManipulator.manipulateAsync(displayUri, [{ rotate: 90 }], {
        compress: 0.95,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      setDisplayUri(result.uri);
      setRect(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rotate this photo.");
    } finally {
      setRotating(false);
    }
  }

  async function applyCrop() {
    if (!metrics || !rect || rect.width < 8 || rect.height < 8) {
      setError("Drag a box around the part of the photo to keep.");
      return;
    }

    setCropping(true);
    setError(null);
    try {
      const selLeft = Math.max(rect.x, metrics.offsetX);
      const selTop = Math.max(rect.y, metrics.offsetY);
      const selRight = Math.min(rect.x + rect.width, metrics.offsetX + metrics.width);
      const selBottom = Math.min(rect.y + rect.height, metrics.offsetY + metrics.height);
      const selWidth = selRight - selLeft;
      const selHeight = selBottom - selTop;

      if (selWidth < 8 || selHeight < 8) {
        setError("Drag a box over the photo itself, not the empty margins.");
        return;
      }

      const result = await ImageManipulator.manipulateAsync(
        displayUri,
        [
          {
            crop: {
              originX: Math.round((selLeft - metrics.offsetX) * metrics.scale),
              originY: Math.round((selTop - metrics.offsetY) * metrics.scale),
              width: Math.round(selWidth * metrics.scale),
              height: Math.round(selHeight * metrics.scale),
            },
          },
        ],
        { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG },
      );
      onDone(result.uri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not crop this photo.");
    } finally {
      setCropping(false);
    }
  }

  function useFullPhoto() {
    // Rotated but never cropped — still hand back the rotated bitmap, or
    // the rotation would silently be lost.
    if (displayUri !== uri) onDone(displayUri);
    else onCancel();
  }

  return (
    <View style={{ gap: space.sm }}>
      <View
        onLayout={(event) =>
          setContainer({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })
        }
        {...panResponder.panHandlers}
        style={{
          height: EDITOR_HEIGHT,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: color.border,
          backgroundColor: color.paper,
          overflow: "hidden",
        }}
      >
        <Image source={{ uri: displayUri }} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
        {rect ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: rect.x,
              top: rect.y,
              width: rect.width,
              height: rect.height,
              borderWidth: 2,
              borderColor: color.primary,
              backgroundColor: "rgba(37,99,235,0.15)",
            }}
          />
        ) : null}
      </View>

      <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
        Rotate if it&apos;s sideways, drag a box around the part to keep, then crop — or use the
        full photo as-is.
      </Text>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button
          label="Crop"
          icon={Crop}
          disabled={!rect || cropping}
          busy={cropping}
          onPress={() => void applyCrop()}
        />
        <Button
          label="Rotate"
          variant="secondary"
          icon={RotateCw}
          busy={rotating}
          disabled={cropping}
          onPress={() => void rotate()}
        />
        <Button
          label="Reset box"
          variant="secondary"
          icon={RotateCcw}
          disabled={!rect || cropping}
          onPress={() => setRect(null)}
        />
        <Button
          label="Use full photo"
          variant="secondary"
          icon={X}
          disabled={cropping}
          onPress={useFullPhoto}
        />
      </View>
    </View>
  );
}

interface ReviewRow {
  key: string;
  name: string;
  sku: string | null;
  productId: string | null;
  matchedBy: "internal" | "supplier" | null;
  purchaseOrderItemId: string | null;
  quantityOrdered: number | null;
  quantityReceived: string;
  unitCost: string;
  appliedPrice: string;
  isFlagged: boolean;
}

function toReviewRow(line: ExtractedReceiptLine): ReviewRow {
  // Same peso-margin suggestion as the web review screen: keep the shelf
  // margin steady when the supplier's cost changed, not the price itself.
  const suggestedPrice =
    line.productId && line.existingPrice !== null && line.existingCostPrice !== null && line.unitCost !== null
      ? roundMoney(line.unitCost + (line.existingPrice - line.existingCostPrice))
      : line.existingPrice;

  return {
    key: newKey(),
    name: line.name,
    sku: line.sku,
    productId: line.productId,
    matchedBy: line.matchedBy,
    purchaseOrderItemId: line.purchaseOrderItemId,
    quantityOrdered: line.quantityOrdered,
    quantityReceived: String(line.quantityReceived ?? line.quantityOrdered ?? 1),
    unitCost: String(line.unitCost ?? 0),
    appliedPrice: suggestedPrice !== null ? String(suggestedPrice) : "",
    isFlagged: line.isFlagged,
  };
}

export default function ReceivingScreen() {
  const router = useRouter();
  const { purchase_order_id } = useLocalSearchParams<{ purchase_order_id?: string }>();
  const purchaseOrderId = purchase_order_id || null;

  const locationScope = useLocationScope();
  const suppliersQuery = useSuppliers();
  const galleryQuery = useGalleryPhotos();
  const uploadToGallery = useUploadGalleryPhoto();

  // "Choose file" opens this picker sheet; "upload" shows the existing
  // camera/library buttons, "gallery" shows the pending-photos grid.
  const [photoModalStep, setPhotoModalStep] = useState<"closed" | "choose" | "upload" | "gallery">(
    "closed",
  );
  const [cameraOpen, setCameraOpen] = useState(false);
  // photoUri is always the untouched original — it's what gets saved as the
  // receipt's own photo, never mutated by crop/rotate. workingUri is null
  // until the user explicitly edits it; AI extraction reads
  // workingUri ?? photoUri, so with no edit both are the same file.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [workingUri, setWorkingUri] = useState<string | null>(null);
  // Set only when photoUri came from the gallery picker — on submit this is
  // sent instead of a fresh upload, so the receipt reuses that stored photo
  // and the gallery entry flips to processed. Cleared by any fresh capture/pick.
  const [galleryPhotoId, setGalleryPhotoId] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [savedForLater, setSavedForLater] = useState(false);

  const extract = useMutation({
    mutationFn: async (uri: string) =>
      extractGoodsReceiptPhoto(getAdminApiClient(), toUploadFile(uri), purchaseOrderId),
    onSuccess: (lines) => {
      setError(null);
      setRows(lines.map(toReviewRow));
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not read this photo."),
  });

  function onCaptured(uri: string) {
    setCameraOpen(false);
    setPhotoUri(uri);
    setWorkingUri(null);
    setGalleryPhotoId(null);
    setCropOpen(false);
    setRows([]);
    setSuccess(false);
    setSavedForLater(false);
    setError(null);
    setPhotoModalStep("closed");
  }

  function pickGalleryPhoto(photo: { id: string; photoUrl: string }) {
    setPhotoUri(photo.photoUrl);
    setWorkingUri(null);
    setGalleryPhotoId(photo.id);
    setCropOpen(false);
    setRows([]);
    setSuccess(false);
    setSavedForLater(false);
    setError(null);
    setPhotoModalStep("closed");
  }

  function runExtract() {
    const source = workingUri ?? photoUri;
    if (!source) return;
    extract.mutate(source);
  }

  async function processLater() {
    if (!photoUri || galleryPhotoId) return;
    setError(null);
    try {
      await uploadToGallery.mutateAsync({
        photo: toUploadFile(photoUri),
        locationId: locationScope.locationId,
      });
      setPhotoUri(null);
      setWorkingUri(null);
      setRows([]);
      setSavedForLater(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this photo for later.");
    }
  }

  async function pickFromLibrary() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(
        permission.canAskAgain
          ? "Needs access to photos to pick an existing one."
          : "Photo access is off for this app. Turn it on in Settings.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    const uri = result.canceled ? null : result.assets[0]?.uri;
    if (uri) onCaptured(uri);
  }

  function updateRow(key: string, patch: Partial<ReviewRow>) {
    setRows((previous) => previous.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeRow(key: string) {
    setRows((previous) => previous.filter((row) => row.key !== key));
  }

  const submit = useMutation({
    mutationFn: async () => {
      const locationId = locationScope.locationId;
      if (!locationId) throw new Error("This terminal is not bound to a branch.");
      if (rows.length === 0) throw new Error("Nothing to receive — read a photo first.");

      const items = rows.map((row) => ({
        name: row.name,
        sku: row.sku,
        quantityReceived: Math.max(0, Number(row.quantityReceived) || 0),
        unitCost: Math.max(0, roundMoney(Number(row.unitCost) || 0)),
        productId: row.productId,
        matchedBy: row.matchedBy,
        purchaseOrderItemId: row.purchaseOrderItemId,
        quantityOrdered: row.quantityOrdered,
        appliedPrice: row.appliedPrice.trim() ? roundMoney(Number(row.appliedPrice)) : null,
        isFlagged: row.isFlagged,
        note: null,
      }));

      return createGoodsReceipt(getAdminApiClient(), {
        locationId,
        supplierId,
        purchaseOrderId,
        referenceNo: referenceNo.trim() || null,
        notes: notes.trim() || null,
        // Gallery-sourced: reuse that stored photo server-side (and mark it
        // processed) instead of re-uploading the same bytes.
        photo: galleryPhotoId || !photoUri ? null : toUploadFile(photoUri),
        galleryPhotoId,
        items,
      });
    },
    onSuccess: () => {
      setSuccess(true);
      setError(null);
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : "Could not save this delivery."),
  });

  const suppliers = suppliersQuery.data ?? [];

  return (
    <View style={{ flex: 1 }}>
      <DocumentScanCameraModal
        open={cameraOpen}
        onCaptured={onCaptured}
        onClose={() => setCameraOpen(false)}
      />
      <BottomSheet open={photoModalStep !== "closed"} onClose={() => setPhotoModalStep("closed")}>
        {photoModalStep === "choose" ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
              Add a photo
            </Text>
            <Pressable
              onPress={() => setPhotoModalStep("upload")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                padding: space.md,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: color.border,
                backgroundColor: color.paper,
              }}
            >
              <Camera size={22} color={color.primary} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                  Upload a photo
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  Take one now, or pick from files
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setPhotoModalStep("gallery")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: space.md,
                padding: space.md,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: color.border,
                backgroundColor: color.paper,
              }}
            >
              <Images size={22} color={color.primary} strokeWidth={1.75} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                  From gallery
                </Text>
                <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                  Saved for later on mobile or web
                </Text>
              </View>
            </Pressable>
          </View>
        ) : photoModalStep === "upload" ? (
          <View style={{ gap: space.sm }}>
            <Button
              label="Take a photo"
              icon={Camera}
              onPress={() => {
                setPhotoModalStep("closed");
                setCameraOpen(true);
              }}
            />
            <Button
              label="Choose from files"
              variant="secondary"
              icon={FolderOpen}
              onPress={() => void pickFromLibrary()}
            />
            <Button label="Back" variant="secondary" onPress={() => setPhotoModalStep("choose")} />
          </View>
        ) : photoModalStep === "gallery" ? (
          <View style={{ gap: space.sm }}>
            <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
              Pick from gallery
            </Text>
            {galleryQuery.isPending ? (
              <Text style={{ fontSize: fontSize.body, color: color.inkMuted }}>Loading…</Text>
            ) : (galleryQuery.data ?? []).length === 0 ? (
              <View style={{ alignItems: "center", gap: space.xs, paddingVertical: space.lg }}>
                <Images size={28} color={color.inkMuted} strokeWidth={1.75} />
                <Text style={{ fontSize: fontSize.body, color: color.inkMuted, textAlign: "center" }}>
                  Nothing waiting to be processed. Take a photo now, or check back once one's been
                  saved for later.
                </Text>
              </View>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {(galleryQuery.data ?? []).map((photo) => (
                  <Pressable
                    key={photo.id}
                    onPress={() => pickGalleryPhoto(photo)}
                    style={{ width: "31%" }}
                  >
                    <Image
                      source={{ uri: photo.photoUrl }}
                      resizeMode="cover"
                      style={{
                        width: "100%",
                        aspectRatio: 1,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: color.border,
                        backgroundColor: color.paper,
                      }}
                    />
                  </Pressable>
                ))}
              </View>
            )}
            <Button label="Back" variant="secondary" onPress={() => setPhotoModalStep("choose")} />
          </View>
        ) : null}
      </BottomSheet>
      <WaveBackdrop />
      <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={{ flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}
        >
          <ArrowLeft size={18} color={color.ink} strokeWidth={2} />
          <Text style={{ fontSize: fontSize.body, color: color.ink, fontWeight: "600" }}>Back</Text>
        </Pressable>

        <Text style={{ fontSize: fontSize.headingSm, fontWeight: "700", color: color.ink }}>
          Receive a delivery
        </Text>
        {purchaseOrderId ? (
          <Badge tone="neutral" label="Matched against this purchase order" />
        ) : (
          <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
            Photograph the delivery receipt or supplier invoice — AI reads the line items.
          </Text>
        )}

        {!locationScope.locationId ? (
          <ErrorNote>This terminal is not bound to a branch. Enroll it before receiving stock.</ErrorNote>
        ) : null}

        <Card style={[{ gap: space.md }, styles.floatShadow, { borderRadius: radius.sm }]}>
          {photoUri ? (
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button
                label="Retake photo"
                variant="secondary"
                icon={RotateCcw}
                onPress={() => setCameraOpen(true)}
                style={{ flex: 1 }}
              />
              <Button
                label="Choose from files"
                variant="secondary"
                icon={FolderOpen}
                onPress={() => void pickFromLibrary()}
                style={{ flex: 1 }}
              />
            </View>
          ) : (
            <View style={{ gap: space.md }}>
              {savedForLater ? (
                <SuccessNote>Saved to the gallery — pick it up from either app when ready.</SuccessNote>
              ) : null}
              <Button
                label="Choose file"
                icon={Upload}
                onPress={() => setPhotoModalStep("choose")}
              />
            </View>
          )}

          {photoUri && cropOpen ? (
            <PhotoCropEditor
              uri={workingUri ?? photoUri}
              onDone={(uri) => {
                setWorkingUri(uri);
                setCropOpen(false);
              }}
              onCancel={() => setCropOpen(false)}
            />
          ) : photoUri ? (
            <View style={{ gap: space.sm }}>
              <Image
                source={{ uri: workingUri ?? photoUri }}
                resizeMode="contain"
                style={{
                  width: "100%",
                  height: 200,
                  borderRadius: radius.sm,
                  borderWidth: 1,
                  borderColor: color.border,
                  backgroundColor: color.paper,
                }}
              />
              <Text style={{ fontSize: fontSize.caption, color: color.inkMuted }}>
                {workingUri
                  ? "Cropped/rotated version shown — this is what AI reads. The original photo is still saved as your receipt record."
                  : "Crop or rotate first if it's sideways or has extra clutter, or read it as-is."}
              </Text>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Button
                  label={extract.isPending ? "Reading…" : "Read with AI"}
                  icon={Sparkles}
                  busy={extract.isPending}
                  onPress={runExtract}
                />
                <Button
                  label="Crop & rotate"
                  variant="secondary"
                  icon={Crop}
                  disabled={extract.isPending}
                  onPress={() => setCropOpen(true)}
                />
                {workingUri ? (
                  <Button
                    label="Reset to original"
                    variant="secondary"
                    icon={X}
                    disabled={extract.isPending}
                    onPress={() => setWorkingUri(null)}
                  />
                ) : null}
                {!galleryPhotoId ? (
                  <Button
                    label="Process it later"
                    variant="secondary"
                    icon={Clock}
                    busy={uploadToGallery.isPending}
                    disabled={extract.isPending}
                    onPress={() => void processLater()}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          {suppliers.length > 0 ? (
            <View style={{ gap: space.xs }}>
              <Text style={{ fontSize: fontSize.caption, fontWeight: "600", color: color.inkMuted }}>
                Supplier (optional)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: space.xs }}>
                  {suppliers.map((supplier) => (
                    <Pressable
                      key={supplier.id}
                      onPress={() => setSupplierId(supplierId === supplier.id ? null : supplier.id)}
                      style={{
                        paddingHorizontal: space.md,
                        paddingVertical: space.sm,
                        borderRadius: radius.sm,
                        borderWidth: 1,
                        borderColor: supplierId === supplier.id ? color.primary : color.border,
                        backgroundColor: supplierId === supplier.id ? color.primaryTint : color.surface,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: fontSize.caption,
                          fontWeight: "600",
                          color: supplierId === supplier.id ? color.primary : color.ink,
                        }}
                      >
                        {supplier.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}

          <TextInput
            value={referenceNo}
            onChangeText={setReferenceNo}
            placeholder="Delivery / invoice reference (optional)"
            placeholderTextColor={color.inkMuted}
            style={{
              minHeight: 44,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.sm,
              paddingHorizontal: space.md,
              color: color.ink,
            }}
          />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Notes (optional)"
            placeholderTextColor={color.inkMuted}
            style={{
              minHeight: 44,
              borderWidth: 1,
              borderColor: color.border,
              borderRadius: radius.sm,
              paddingHorizontal: space.md,
              color: color.ink,
            }}
          />
        </Card>

        {rows.length > 0 ? (
          <Card style={[{ gap: space.sm }, styles.floatShadow, { borderRadius: radius.sm }]}>
            <Text style={{ fontSize: fontSize.body, fontWeight: "700", color: color.ink }}>
              {rows.length} line{rows.length === 1 ? "" : "s"} read
            </Text>
            {rows.map((row) => (
              <View
                key={row.key}
                style={{ gap: space.xs, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: color.border }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: fontSize.body, fontWeight: "600", color: color.ink }}>
                      {row.name}
                    </Text>
                    <View style={{ flexDirection: "row", gap: space.xs, flexWrap: "wrap" }}>
                      <Badge
                        tone={row.productId ? "success" : "warning"}
                        label={row.productId ? "In catalogue" : "Not yet in catalogue"}
                      />
                      {row.isFlagged ? <Badge tone="danger" label="Check this line" /> : null}
                      {row.quantityOrdered !== null ? (
                        <Badge tone="neutral" label={`Ordered ${row.quantityOrdered}`} />
                      ) : null}
                    </View>
                  </View>
                  <IconButton icon={Trash2} label="Remove line" tone="danger" onPress={() => removeRow(row.key)} />
                </View>

                <View style={{ flexDirection: "row", gap: space.sm }}>
                  <RowField label="Qty" value={row.quantityReceived} onChangeText={(v) => updateRow(row.key, { quantityReceived: v })} />
                  <RowField label="Unit cost" value={row.unitCost} onChangeText={(v) => updateRow(row.key, { unitCost: v })} />
                  {row.productId ? (
                    <RowField
                      label="New price"
                      value={row.appliedPrice}
                      onChangeText={(v) => updateRow(row.key, { appliedPrice: v })}
                    />
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {success ? <SuccessNote>Delivery received. Stock and prices updated.</SuccessNote> : null}

        {rows.length > 0 ? (
          <Button
            label={submit.isPending ? "Saving…" : "Post this delivery"}
            large
            icon={PackageCheck}
            busy={submit.isPending}
            onPress={() => submit.mutate()}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function RowField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 11, fontWeight: "600", color: color.inkMuted }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        style={{
          minHeight: 40,
          borderWidth: 1,
          borderColor: color.border,
          borderRadius: radius.sm,
          paddingHorizontal: space.sm,
          color: color.ink,
        }}
      />
    </View>
  );
}
