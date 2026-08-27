"use server";

import { revalidatePath } from "next/cache";
import { ApiError } from "@double-a/api-client";
import {
  createLocation,
  deleteLocation,
  updateLocation,
} from "@double-a/api-client/queries";
import type { LocationType } from "@double-a/shared-types";
import type { FormState } from "@/lib/form-state";
import { getAuthedClient } from "@/lib/api/session";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const firstFieldError = error.errors ? Object.values(error.errors)[0]?.[0] : undefined;
    return firstFieldError ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

export async function saveLocation(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = String(formData.get("id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "branch") as LocationType;
  const address = String(formData.get("address") ?? "").trim() || null;
  const isActive = formData.get("is_active") !== "false";

  if (!name) return { error: "Name is required.", ok: false };
  if (type !== "branch" && type !== "warehouse") {
    return { error: "Type must be branch or warehouse.", ok: false };
  }

  const client = getAuthedClient();
  try {
    if (id) {
      await updateLocation(client, id, { name, type, address, isActive });
    } else {
      await createLocation(client, { name, type, address, isActive });
    }
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }

  revalidatePath("/locations");
  revalidatePath("/stock-transfers");
  return { error: null, ok: true };
}

export async function setLocationActive(id: string, isActive: boolean): Promise<FormState> {
  try {
    await updateLocation(getAuthedClient(), id, { isActive });
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }
  revalidatePath("/locations");
  revalidatePath("/stock-transfers");
  return { error: null, ok: true };
}

export async function removeLocation(id: string): Promise<FormState> {
  try {
    await deleteLocation(getAuthedClient(), id);
  } catch (error) {
    return { error: errorMessage(error), ok: false };
  }
  revalidatePath("/locations");
  revalidatePath("/stock-transfers");
  return { error: null, ok: true };
}
