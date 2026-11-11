/** 这些路径必须进 Hono，不能交给静态资源和 SPA 回退。 */
export function isAppPath(pathname: string): boolean {
  return (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}
