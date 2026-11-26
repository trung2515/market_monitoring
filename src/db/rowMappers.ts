/** Hàm đọc giá trị từ row SQLite một cách an toàn kiểu. */
type Value = unknown;

export const str = (v: Value): string => (v === null || v === undefined ? '' : String(v));
export const strOrNull = (v: Value): string | null => (v === null || v === undefined ? null : String(v));
export const num = (v: Value): number => Number(v ?? 0);
export const numOrNull = (v: Value): number | null => (v === null || v === undefined ? null : Number(v));
export const bool = (v: Value): boolean => Number(v) === 1;

export function jsonArray(v: Value): string[] {
  try {
    const parsed: unknown = JSON.parse(str(v) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface ProductFilter {
  categories?: string[];
  brands?: string[];
}

/**
 * Sinh mệnh đề WHERE cho bộ lọc danh mục/hãng (dùng tham số ? – an toàn SQL injection).
 * @param alias bí danh bảng products trong câu SQL
 */
export function buildProductFilter(filter: ProductFilter | undefined, alias = 'p') {
  const clauses: string[] = [];
  const params: string[] = [];
  if (filter?.categories?.length) {
    clauses.push(`${alias}.category_slug IN (${filter.categories.map(() => '?').join(',')})`);
    params.push(...filter.categories);
  }
  if (filter?.brands?.length) {
    clauses.push(`LOWER(${alias}.brand) IN (${filter.brands.map(() => '?').join(',')})`);
    params.push(...filter.brands.map((b) => b.toLowerCase()));
  }
  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
}
