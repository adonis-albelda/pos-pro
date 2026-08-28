/**
 * Shared list query helpers for admin record pages.
 * Search and page live in the URL so refresh and share keep the same view.
 */

export const DEFAULT_PAGE_SIZE = 25;

/** First fetch only — keep list mounted while URL-driven refetches run. */
export function isInitialQueryLoad(isPending: boolean, hasData: boolean): boolean {
  return isPending && !hasData;
}

export function parseListQuery(params: {
  q?: string;
  page?: string;
}): { q: string; page: number } {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  return { q: (params.q ?? "").trim(), page };
}

export function matchesQuery(haystacks: Array<string | null | undefined>, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return haystacks.some((value) => value?.toLowerCase().includes(needle));
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = DEFAULT_PAGE_SIZE,
): {
  pageItems: T[];
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
} {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    pageItems: items.slice(start, start + pageSize),
    page: safePage,
    pageCount,
    total,
    pageSize,
  };
}
