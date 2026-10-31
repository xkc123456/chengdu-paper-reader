// 设备标识：只用来区分「这台浏览器的存档归谁」。
// 不是账号、不上传身份信息；换设备用「迁移码」恢复（后续再做）。
const KEY = "cdreader.device.v1";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && existing.length >= 8) return existing;
    const created = randomId();
    localStorage.setItem(KEY, created);
    return created;
  } catch {
    // 隐私模式 / 禁用存储：退化成一个会话内临时 id，不持久化
    return randomId();
  }
}
