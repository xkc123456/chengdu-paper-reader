// 省 → 市 → 学校 索引，从 public/data/universities.json 懒加载（约 79 KB，gzip 后 20 KB 左右）。
// 只在用户第一次打开填写卡片时请求，不进入首屏包。

export type UniversityIndex = Record<string, Record<string, string[]>>;

let pending: Promise<UniversityIndex> | null = null;

export function loadUniversities(): Promise<UniversityIndex> {
  if (!pending) {
    pending = fetch("/data/universities.json")
      .then((res) => (res.ok ? res.json() : {}))
      .catch(() => ({})) as Promise<UniversityIndex>;
  }
  return pending;
}

export function citiesOf(index: UniversityIndex, province: string): string[] {
  return Object.keys(index[province] ?? {}).sort((a, b) => a.localeCompare(b, "zh"));
}

export function schoolsOf(index: UniversityIndex, province: string, city: string): string[] {
  return index[province]?.[city] ?? [];
}
