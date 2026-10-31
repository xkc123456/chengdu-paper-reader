// 访客标识与同意状态。
//
// 站点没有账号体系：visitorId 是浏览器第一次访问时生成的随机 UUID，只存在本机
// localStorage。它的用途是把「阅读档案」和「同意记录」锚定到同一台设备——
// 服务端看到的只是一串无意义编号，不包含任何身份信息。

import { LEGAL_VERSION } from "@contracts/legal";

const VISITOR_KEY = "cd-visitor-id";
const CONSENT_KEY = "cd-consent";
const PROFILE_SKIPPED_KEY = "cd-profile-skipped";

export function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    // 隐私模式写不进去：用临时 ID，本次会话内档案功能可用，刷新后互不相见
    return crypto.randomUUID();
  }
}

/** 已同意且版本未过期时返回 true；政策升版本后旧同意自动失效，重新弹门 */
export function hasConsent(): boolean {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as { version?: string }).version === LEGAL_VERSION;
  } catch {
    return false;
  }
}

export function saveConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: LEGAL_VERSION, at: Date.now() }));
  } catch {
    // ignore
  }
}

export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // ignore
  }
}

export function isProfileSkipped(): boolean {
  try {
    return localStorage.getItem(PROFILE_SKIPPED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveProfileSkipped(): void {
  try {
    localStorage.setItem(PROFILE_SKIPPED_KEY, "1");
  } catch {
    // ignore
  }
}
