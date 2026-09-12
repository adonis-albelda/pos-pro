import type { Location, LocationType, StockTransfer, StockTransferStatus } from "@double-a/shared-types";
import { ApiError, type ApiClient, type JsonApiPage, type JsonApiResource } from "../http";
import { type LocationAttrs, type StockTransferAttrs, toLocation, toStockTransfer } from "../mappers";

export interface LocationInput {
  name: string;
  type: LocationType;
  address?: string | null;
  isActive?: boolean;
}

function toLocationPayload(input: Partial<LocationInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.type !== undefined) payload.type = input.type;
  if (input.address !== undefined) payload.address = input.address;
  if (input.isActive !== undefined) payload.is_active = input.isActive;
  return payload;
}

export async function listLocations(
  client: ApiClient,
  options: { type?: LocationType; includeInactive?: boolean } = {},
): Promise<Location[]> {
  const { data } = await client.get<{ data: JsonApiResource<LocationAttrs>[] }>("/locations", {
    type: options.type,
    is_active: options.includeInactive ? undefined : true,
  });
  return data.map(toLocation);
}

export async function getLocation(client: ApiClient, id: string): Promise<Location | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<LocationAttrs> }>(`/locations/${id}`);
    return toLocation(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createLocation(client: ApiClient, input: LocationInput): Promise<Location> {
  const { data } = await client.post<{ data: JsonApiResource<LocationAttrs> }>(
    "/locations",
    toLocationPayload(input),
  );
  return toLocation(data);
}

export async function updateLocation(
  client: ApiClient,
  id: string,
  patch: Partial<LocationInput>,
): Promise<Location> {
  const { data } = await client.patch<{ data: JsonApiResource<LocationAttrs> }>(
    `/locations/${id}`,
    toLocationPayload(patch),
  );
  return toLocation(data);
}

export async function deleteLocation(client: ApiClient, id: string): Promise<void> {
  await client.delete(`/locations/${id}`);
}

export interface StockTransferInput {
  fromLocationId: string;
  toLocationId: string;
  notes?: string | null;
  items: Array<{ productId: string; variantId?: string | null; quantity: number }>;
  status?: "pending" | "in_transit";
  receiveNow?: boolean;
}

export interface StockTransfersFilter {
  status?: StockTransferStatus;
  fromLocationId?: string;
  toLocationId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listStockTransfers(
  client: ApiClient,
  options: StockTransfersFilter = {},
): Promise<{ transfers: StockTransfer[]; total: number; lastPage: number }> {
  const pageSize = options.pageSize ?? 50;
  const page = await client.get<JsonApiPage<StockTransferAttrs>>("/stock-transfers", {
    status: options.status,
    from_location_id: options.fromLocationId,
    to_location_id: options.toLocationId,
    date_from: options.dateFrom,
    date_to: options.dateTo,
    search: options.search,
    page: options.page ?? 1,
    per_page: pageSize,
  });
  const total = page.meta?.total ?? page.data.length;
  return {
    transfers: page.data.map(toStockTransfer),
    total,
    lastPage: page.meta?.last_page ?? Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getStockTransfer(client: ApiClient, id: string): Promise<StockTransfer | null> {
  try {
    const { data } = await client.get<{ data: JsonApiResource<StockTransferAttrs> }>(
      `/stock-transfers/${id}`,
    );
    return toStockTransfer(data);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function createStockTransfer(
  client: ApiClient,
  input: StockTransferInput,
): Promise<StockTransfer> {
  const { data } = await client.post<{ data: JsonApiResource<StockTransferAttrs> }>(
    "/stock-transfers",
    {
      from_location_id: input.fromLocationId,
      to_location_id: input.toLocationId,
      notes: input.notes ?? null,
      status: input.status ?? "pending",
      receive_now: input.receiveNow ?? false,
      items: input.items.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId ?? null,
        quantity: item.quantity,
      })),
    },
    { idempotent: true },
  );
  return toStockTransfer(data);
}

export async function updateStockTransfer(
  client: ApiClient,
  id: string,
  patch: { status?: StockTransferStatus; notes?: string | null },
): Promise<StockTransfer> {
  const payload: Record<string, unknown> = {};
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  const { data } = await client.patch<{ data: JsonApiResource<StockTransferAttrs> }>(
    `/stock-transfers/${id}`,
    payload,
  );
  return toStockTransfer(data);
}

/** @deprecated Use `updateStockTransfer(client, id, { status })` — kept for existing call sites. */
export async function updateStockTransferStatus(
  client: ApiClient,
  id: string,
  status: StockTransferStatus,
): Promise<StockTransfer> {
  return updateStockTransfer(client, id, { status });
}

/**
 * Receives some or all of what's still remaining, per item. Omit `items` to
 * receive everything remaining (the original all-at-once behavior).
 */
export async function receiveStockTransfer(
  client: ApiClient,
  id: string,
  items?: Array<{ itemId: string; quantityReceived: number }>,
): Promise<StockTransfer> {
  const { data } = await client.post<{ data: JsonApiResource<StockTransferAttrs> }>(
    `/stock-transfers/${id}/receive`,
    items
      ? {
          items: items.map((line) => ({
            item_id: line.itemId,
            quantity_received: line.quantityReceived,
          })),
        }
      : {},
    { idempotent: true },
  );
  return toStockTransfer(data);
}
