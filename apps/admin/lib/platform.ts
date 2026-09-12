import { redirect } from "next/navigation";
import type { ApiClient } from "@double-a/api-client";
import { ROLES, type User } from "@double-a/shared-types";
import { getAuthedClient, getCurrentUser } from "@/lib/api/session";

export async function requireSuperadmin(): Promise<{ client: ApiClient; user: User }> {
  const user = await getCurrentUser();
  if (!user || user.role !== ROLES.SUPERADMIN) {
    redirect("/");
  }
  return { client: getAuthedClient(), user };
}
