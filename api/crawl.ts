// /robots.txt 与 /sitemap.xml 的响应。调用方负责传入文件正文；
// 这里保证内容类型正确，并且正文一旦像首页 HTML 就改成纯文本 404，
// 避免单页回退把壳页交给爬虫。

export const ROBOTS_PATH = "/robots.txt";
export const SITEMAP_PATH = "/sitemap.xml";

const CRAWL_FILES: Record<string, { filename: string; contentType: string }> = {
  [ROBOTS_PATH]: {
    filename: "robots.txt",
    contentType: "text/plain; charset=utf-8",
  },
  [SITEMAP_PATH]: {
    filename: "sitemap.xml",
    contentType: "application/xml; charset=utf-8",
  },
};

const HTML_SHELL = /<!doctype\s+html|<html[\s>]/i;

export function isCrawlPath(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(CRAWL_FILES, pathname);
}

export function crawlFilename(pathname: string): string | undefined {
  return CRAWL_FILES[pathname]?.filename;
}

export function missingCrawlResponse(): Response {
  return new Response("Not Found\n", {
    status: 404,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function serveCrawlBody(pathname: string, body: string): Response {
  const file = CRAWL_FILES[pathname];
  if (!file || HTML_SHELL.test(body)) return missingCrawlResponse();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": file.contentType,
      "cache-control": "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
