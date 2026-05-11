export interface PageParams {
  page: number;
  offset: number;
  perPage: number;
}

export function getPageParams(
  searchParams: Record<string, string | string[] | undefined>,
  perPage = 20
): PageParams {
  const raw = searchParams["page"];
  const page = Math.max(1, parseInt(typeof raw === "string" ? raw : "1", 10));
  return { page, offset: (page - 1) * perPage, perPage };
}
