import type { ApiClient } from "../http";
import type { AiPlanId, AiSubscriptionPlan } from "@double-a/shared-types";

export interface PlatformAiSettings {
  photoOverageChargePeso: number;
  plans: AiSubscriptionPlan[];
}

interface PlatformAiPlanAttrs {
  id: number;
  name: string;
  photo_extract_weekly_limit: number;
  vector_search_weekly_limit: number;
  sort_order: number;
}

interface PlatformAiSettingsAttrs {
  photo_overage_charge_peso: number;
  plans: PlatformAiPlanAttrs[];
}

function mapPlan(plan: PlatformAiPlanAttrs): AiSubscriptionPlan {
  return {
    id: plan.id as AiPlanId,
    name: plan.name,
    photoExtractWeeklyLimit: plan.photo_extract_weekly_limit,
    vectorSearchWeeklyLimit: plan.vector_search_weekly_limit,
    sortOrder: plan.sort_order,
  };
}

function mapPlatformAiSettings(data: PlatformAiSettingsAttrs): PlatformAiSettings {
  return {
    photoOverageChargePeso: data.photo_overage_charge_peso,
    plans: data.plans.map(mapPlan).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function getPlatformAiSettings(client: ApiClient): Promise<PlatformAiSettings> {
  const result = await client.get<{ data: PlatformAiSettingsAttrs }>("/superadmin/ai-settings");
  return mapPlatformAiSettings(result.data);
}

export interface ProductEmbeddingCoverage {
  total: number;
  embedded: number;
  percent: number;
}

/** Coverage across every company — embeddings are a platform-wide backfill, not a per-company setting. */
export async function getProductEmbeddingCoverage(
  client: ApiClient,
): Promise<ProductEmbeddingCoverage> {
  const result = await client.get<{ data: ProductEmbeddingCoverage }>(
    "/superadmin/products/embedding-coverage",
  );
  return result.data;
}

/**
 * Queues GenerateProductEmbeddingJob (as a batch, so it can be cancelled
 * mid-run) for every active product still missing one. `batchId` is null
 * when there was nothing to queue.
 */
export async function embedAllProducts(
  client: ApiClient,
): Promise<{ queued: number; batchId: string | null }> {
  const result = await client.post<{ data: { queued: number; batch_id: string | null } }>(
    "/superadmin/products/embed-all",
    {},
  );
  return { queued: result.data.queued, batchId: result.data.batch_id };
}

export interface EmbedAllBatchStatus {
  id: string;
  totalJobs: number;
  pendingJobs: number;
  processedJobs: number;
  failedJobs: number;
  finished: boolean;
  cancelled: boolean;
}

export async function getEmbedAllBatchStatus(
  client: ApiClient,
  batchId: string,
): Promise<EmbedAllBatchStatus> {
  const result = await client.get<{
    data: {
      id: string;
      total_jobs: number;
      pending_jobs: number;
      processed_jobs: number;
      failed_jobs: number;
      finished: boolean;
      cancelled: boolean;
    };
  }>(`/superadmin/products/embed-all/${batchId}`);

  return {
    id: result.data.id,
    totalJobs: result.data.total_jobs,
    pendingJobs: result.data.pending_jobs,
    processedJobs: result.data.processed_jobs,
    failedJobs: result.data.failed_jobs,
    finished: result.data.finished,
    cancelled: result.data.cancelled,
  };
}

/** Jobs already picked up by a worker still finish; every job still queued becomes a no-op. */
export async function cancelEmbedAllBatch(client: ApiClient, batchId: string): Promise<void> {
  await client.post(`/superadmin/products/embed-all/${batchId}/cancel`, {});
}

export async function updatePlatformAiSettings(
  client: ApiClient,
  settings: {
    photoOverageChargePeso: number;
    plans: Array<{
      id: AiPlanId;
      name?: string;
      photoExtractWeeklyLimit: number;
      vectorSearchWeeklyLimit: number;
    }>;
  },
): Promise<PlatformAiSettings> {
  const result = await client.patch<{ data: PlatformAiSettingsAttrs }>("/superadmin/ai-settings", {
    photo_overage_charge_peso: settings.photoOverageChargePeso,
    plans: settings.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      photo_extract_weekly_limit: plan.photoExtractWeeklyLimit,
      vector_search_weekly_limit: plan.vectorSearchWeeklyLimit,
    })),
  });
  return mapPlatformAiSettings(result.data);
}
