// 设备标识：只用来区分「这台浏览器的存档归谁」。
// 不是账号、不上传身份信息；换设备用「迁移码」恢复（后续再做）。
const KEY = "cdreader.device.v1";
const COOKIE = "cdreader_device";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readCookie(): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function writeCookie(id: string): void {
  try {
    // 用 domain 级 cookie，让 www.cdreader.top 与 cdreader.top 共用同一个设备身份；
    // 其他域名（localhost / workers.dev）不加 Domain。
    const domain = location.hostname.endsWith("cdreader.top") ? "; Domain=.cdreader.top" : "";
    document.cookie = `${COOKIE}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax${domain}`;
  } catch {
    // 忽略：cookie 被禁用时只靠 localStorage
  }
}

export function getDeviceId(): string {
  try {
    const local = localStorage.getItem(KEY);
    if (local && local.length >= 8) {
      writeCookie(local);
      return local;
    }
    // localStorage 为空（换浏览器/清过缓存），但同域 cookie 还在：沿用同一个身份
    const cookie = readCookie();
    if (cookie && cookie.length >= 8) {
      localStorage.setItem(KEY, cookie);
      return cookie;
    }
    const created = randomId();
    localStorage.setItem(KEY, created);
    writeCookie(created);
    return created;
  } catch {
    // 隐私模式 / 禁用存储：退化成一个会话内临时 id，不持久化
    return readCookie() ?? randomId();
  }
}
