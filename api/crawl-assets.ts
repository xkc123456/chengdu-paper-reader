// Worker 打包时把 public/ 里的爬虫文件内联进来。
// 不要从 api/server.ts 这条 Node 打包链引用本文件：esbuild 脚本没有 Text loader。
import robotsTxt from "../public/robots.txt";
import sitemapXml from "../public/sitemap.xml";

export { robotsTxt, sitemapXml };
