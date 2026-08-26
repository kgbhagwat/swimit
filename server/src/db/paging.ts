export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type Paging = {
  page: number;
  pageSize: number;
  offset: number;
};

export function parsePaging(
  query: { page?: unknown; pageSize?: unknown; limit?: unknown },
  fallbackPageSize = DEFAULT_PAGE_SIZE,
): Paging {
  const pageRaw = Math.trunc(Number(query.page));
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const sizeRaw = Math.trunc(Number(query.pageSize ?? query.limit ?? fallbackPageSize));
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(Math.max(sizeRaw, 1), MAX_PAGE_SIZE)
    : fallbackPageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function wantsPaging(query: { page?: unknown }) {
  return query.page != null && String(query.page).trim() !== '';
}
