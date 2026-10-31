import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { serveCrawlBody } from "./crawl";

const root = path.resolve(import.meta.dirname, "..");

function readPublic(name: string): string {
  return readFileSync(path.join(root, "public", name), "utf8");
}

type Rule = { kind: "allow" | "disallow"; path: string };
type Group = { agents: string[]; rules: Rule[] };

function parseRobots(text: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let agents: string[] = [];
  let rules: Rule[] = [];
  const flush = () => {
    if (agents.length === 0 && rules.length === 0) return;
    groups.push({ agents, rules });
    agents = [];
    rules = [];
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      flush();
      continue;
    }
    const idx = line.indexOf(":");
    if (idx === -1) throw new Error(`invalid robots line: ${line}`);
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (rules.length) flush();
      agents.push(value);
    } else if (key === "allow" || key === "disallow") {
      rules.push({ kind: key, path: value });
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else {
      throw new Error(`unsupported robots directive: ${key}`);
    }
  }
  flush();
  return { groups, sitemaps };
}

function groupFor(groups: Group[], token: string): Group {
  const want = token.toLowerCase();
  let best: Group | undefined;
  let bestLen = -1;
  for (const group of groups) {
    for (const agent of group.agents) {
      const name = agent.toLowerCase();
      const len = name === "*" ? 0 : name === want ? name.length : -1;
      if (len > bestLen) {
        best = group;
        bestLen = len;
      }
    }
  }
  if (!best) throw new Error(`no robots group for ${token}`);
  return best;
}

function allowed(
  rules: Rule[],
  urlPath: string,
  mode: "longest" | "first"
): boolean {
  if (mode === "first") {
    for (const rule of rules) {
      if (rule.path && urlPath.startsWith(rule.path))
        return rule.kind === "allow";
    }
    return true;
  }
  let best: Rule | undefined;
  for (const rule of rules) {
    if (!rule.path || !urlPath.startsWith(rule.path)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
    else if (rule.path.length === best.path.length && rule.kind === "allow")
      best = rule;
  }
  return best ? best.kind === "allow" : true;
}

describe("crawl files", () => {
  const robots = readPublic("robots.txt");
  const parsed = parseRobots(robots);

  it("robots.txt is valid text and does not contain the homepage shell", () => {
    expect(robots).not.toMatch(/<!doctype|<html|Content-Signal/i);
    expect(robots).not.toContain("<");
    expect(robots.endsWith("\n")).toBe(true);
    expect(parsed.sitemaps).toEqual(["https://cdreader.top/sitemap.xml"]);
  });

  it("allows search crawlers, including Baiduspider, on the homepage", () => {
    for (const token of [
      "Baiduspider",
      "Baiduspider-render",
      "Googlebot",
      "Bingbot",
      "PetalBot",
      "*",
    ]) {
      const rules = groupFor(parsed.groups, token).rules;
      expect(allowed(rules, "/", "longest"), token).toBe(true);
      expect(allowed(rules, "/", "first"), token).toBe(true);
      expect(allowed(rules, "/api/trpc", "longest"), token).toBe(false);
      expect(allowed(rules, "/admin", "first"), token).toBe(false);
    }
  });

  it("keeps training crawlers off the whole site", () => {
    for (const token of [
      "GPTBot",
      "ClaudeBot",
      "Google-Extended",
      "Applebot-Extended",
      "Bytespider",
    ]) {
      const rules = groupFor(parsed.groups, token).rules;
      expect(allowed(rules, "/", "longest"), token).toBe(false);
      expect(allowed(rules, "/", "first"), token).toBe(false);
    }
  });

  it("sitemap.xml is the homepage only", () => {
    const sitemap = readPublic("sitemap.xml");
    expect(sitemap).not.toMatch(/<!doctype|<html/i);
    const parsedXml = spawnSync(
      "python3",
      [
        "-c",
        `
import xml.etree.ElementTree as ET, sys
root = ET.parse(sys.argv[1]).getroot()
ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
assert root.tag == ns + "urlset", root.tag
locs = [el.text for el in root.iter(ns + "loc")]
assert locs == ["https://cdreader.top/"], locs
`,
        path.join(root, "public", "sitemap.xml"),
      ],
      { encoding: "utf8" }
    );
    expect(parsedXml.status, parsedXml.stderr).toBe(0);
  });

  it("refuses to serve an HTML shell on crawl paths", async () => {
    const html = readFileSync(path.join(root, "index.html"), "utf8");
    const rejected = serveCrawlBody("/robots.txt", html);
    expect(rejected.status).toBe(404);
    expect(rejected.headers.get("content-type")).toContain("text/plain");
    expect(await rejected.text()).not.toMatch(/<html/i);

    const ok = serveCrawlBody("/robots.txt", robots);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await ok.text()).toBe(robots);

    const xml = serveCrawlBody("/sitemap.xml", readPublic("sitemap.xml"));
    expect(xml.headers.get("content-type")).toBe(
      "application/xml; charset=utf-8"
    );
  });

  it("worker bundle inlines the public crawl files", async () => {
    const result = await build({
      absWorkingDir: root,
      entryPoints: ["api/crawl-assets.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      loader: { ".txt": "text", ".xml": "text" },
    });
    const js = result.outputFiles[0].text;
    expect(js).not.toMatch(/<!doctype html/i);
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), "crawl-")),
      "assets.js"
    );
    writeFileSync(file, js);
    const mod = (await import(file)) as {
      robotsTxt: string;
      sitemapXml: string;
    };
    expect(mod.robotsTxt).toBe(robots);
    expect(mod.sitemapXml).toBe(readPublic("sitemap.xml"));
  });
});
