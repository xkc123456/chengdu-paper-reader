// 使用者身份（院校 + 专业）：只存在浏览器 localStorage 里。
//
// 刻意不收集姓名、手机号、邮箱：知道"哪个学校哪个专业在用"就足够改进产品，
// 再多的字段既违反最小必要，也会让同学一打开就关掉。

export type Profile = {
  province: string;
  city: string;
  school: string;
  major: string;
  /** 填写时间，仅用于本地判断是否需要重新询问（由 saveProfile 写入） */
  savedAt?: number;
};

const KEY = "cd-profile";
const SKIP_KEY = "cd-profile-skipped";

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (!parsed.school) return null;
    return {
      province: parsed.province ?? "",
      city: parsed.city ?? "",
      school: parsed.school,
      major: parsed.major ?? "",
      savedAt: parsed.savedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...profile, savedAt: Date.now() }));
    localStorage.removeItem(SKIP_KEY);
  } catch {
    // 隐私模式下写不进去：本次会话内仍然可用，不阻塞
  }
}

export function clearProfile(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** 用户点了「先跳过」：这台设备不再自动弹窗，但仍可从右上角补填 */
export function wasSkipped(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function markSkipped(): void {
  try {
    localStorage.setItem(SKIP_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearSkipped(): void {
  try {
    localStorage.removeItem(SKIP_KEY);
  } catch {
    // ignore
  }
}
