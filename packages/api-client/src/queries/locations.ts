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
  items: Array<{ productId: string; quantity: number }>;
  status?: "pending" | "in_transit";
  receiveNow?: boolean;
}

export async function listStockTransfers(
  client: ApiClient,
  options: { status?: StockTransferStatus; page?: number; pageSize?: number } = {},
): Promise<{ transfers: StockTransfer[]; total: number }> {
  const page = await client.get<JsonApiPage<StockTransferAttrs>>("/stock-transfers", {
    status: options.status,
    page: options.page ?? 1,
    per_page: options.pageSize ?? 50,
  });
  return {
    transfers: page.data.map(toStockTransfer),
    total: page.meta?.total ?? page.data.length,
  };
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
      status: input.status ?? "pending",
      receive_now: input.receiveNow ?? false,
      items: input.items.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    },
    { idempotent: true },
  );
  return toStockTransfer(data);
}

export async function updateStockTransferStatus(
  client: ApiClient,
  id: string,
  status: StockTransferStatus,
): Promise<StockTransfer> {
  const { data } = await client.patch<{ data: JsonApiResource<StockTransferAttrs> }>(
    `/stock-transfers/${id}`,
    { status },
  );
  return toStockTransfer(data);
}
