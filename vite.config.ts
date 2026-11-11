import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { injectHomeStaticHtml } from "./src/homeStaticHtml"

function homeStaticBody(): Plugin {
  return {
    name: "home-static-body",
    transformIndexHtml(html) {
      return injectHomeStaticHtml(html)
    },
  }
}

export default defineConfig({
  plugins: [
    // /api 与 /admin 交给 Hono。其余路径留给 Vite，避免后台被首页壳吞掉。
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/|admin(?:$|[/?])).*$/] }),
    react(),
    homeStaticBody()],
  envDir: path.resolve(__dirname),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@contracts": path.resolve(__dirname, "contracts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    allowedHosts: true,
  },
})
