// 访客自己的模型 Key：只存在浏览器的 localStorage 里，随解析请求发一次给服务端转发，
// 服务端不落库、不进日志（见 api/paperRouter.ts 与 api/lib/scrub.ts）。
// 存在这里而不是每次手输，是为了刷新页面后不用重新粘贴。

const STORAGE_KEY = "cd-llm-key";

export function loadKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    // 隐私模式 / 禁用存储时按「没有 Key」处理，不影响页面其他部分
    return "";
  }
}

export function saveKey(value: string): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 存不进去就算了：本次会话内仍可正常使用
  }
}

/** 只用于界面回显，绝不参与请求 */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return "已保存";
  return `${key.slice(0, 5)}…${key.slice(-4)}`;
}
