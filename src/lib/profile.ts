// 使用者身份（院校 + 专业 + 学历层次）。
//
// 本地保存一份用于回显；提交时同步上报到服务端（见 api/profileRouter.ts），
// 站长可以在后台看到汇总。不收集姓名、手机号、邮箱。

export type Profile = {
  /** 省 / 直辖市 / 香港 / 澳门 / 中国台湾地区 / 海外 */
  region: string;
  city: string;
  school: string;
  /** 学院，选填 */
  college: string;
  major: string;
  /** 学历层次：高中及以下 / 专科 / 本科 / 硕士研究生 / 博士研究生及以上 */
  degree: Degree;
  savedAt?: number;
};

const KEY = "cd-profile";

export const DEGREES = ["高中及以下", "专科", "本科", "硕士研究生", "博士研究生及以上"] as const;

export type Degree = (typeof DEGREES)[number];

/** 界面上显示的地区名 → 院校数据里的键 */
export const REGION_ALIASES: Record<string, string> = {
  香港: "香港特别行政区",
  澳门: "澳门特别行政区",
  中国台湾地区: "台湾省",
};

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (!parsed.school || !parsed.region) return null;
    return {
      region: parsed.region,
      city: parsed.city ?? "",
      school: parsed.school,
      college: parsed.college ?? "",
      major: parsed.major ?? "",
      degree: (parsed.degree as Degree) ?? "本科",
      savedAt: parsed.savedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...profile, savedAt: Date.now() }));
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
