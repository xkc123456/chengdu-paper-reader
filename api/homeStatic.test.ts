import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { homeCopy } from "../src/homeCopy";
import {
  homeStaticBodyHtml,
  injectHomeStaticHtml,
} from "../src/homeStaticHtml";

const root = path.resolve(import.meta.dirname, "..");

describe("homepage static body", () => {
  const source = readFileSync(path.join(root, "index.html"), "utf8");
  const html = injectHomeStaticHtml(source);
  const body = html.slice(html.toLowerCase().indexOf("<body"));
  const mount =
    body.match(/<div id="root">([\s\S]*)<\/div>\s*<script/)?.[1] ?? "";

  it("puts the product claim and FAQ answers in the document body", () => {
    expect(html).toContain(`<title>${homeCopy.documentTitle}</title>`);
    expect(homeCopy.documentTitle).toContain("论文精读工作台");
    expect(homeCopy.documentTitle).toContain("澄读");
    expect(mount).toContain(homeCopy.kicker);
    expect(mount).toContain(homeCopy.brand);
    expect(mount).toContain(homeCopy.claim);
    expect(mount).toContain(homeCopy.faqHeading);
    expect(mount).toContain(homeCopy.noScriptNote);
    for (const item of homeCopy.faq) {
      expect(mount).toContain(item.question);
      expect(mount).toContain(item.answer);
    }
    expect(mount).not.toContain('<div id="root"></div>');
    expect(body).not.toContain('<div id="root"></div>');
  });

  it("keeps the claim and FAQ visible, and does not prerender the sample paper", () => {
    const claimAt = mount.indexOf(homeCopy.claim);
    expect(claimAt).toBeGreaterThan(0);
    expect(mount.slice(claimAt - 80, claimAt)).not.toMatch(
      /display:\s*none|hidden=|aria-hidden="true"/
    );
    expect(mount).toContain("<details open>");
    expect(mount).not.toMatch(/<script/i);
    expect(mount).not.toContain("数字金融与中小企业融资约束");
    expect(mount).not.toContain("HONEST");
    expect(mount).not.toContain("按那一类");
    expect(homeStaticBodyHtml()).toBe(mount);
  });

  it("injects once and leaves the module entry in place", () => {
    expect(injectHomeStaticHtml(html)).toBe(html);
    expect(html).toContain(
      '<script type="module" src="/src/main.tsx"></script>'
    );
    expect(injectHomeStaticHtml("<html></html>")).toBe("<html></html>");
  });

  it("is applied by the vite html transform", () => {
    const config = readFileSync(path.join(root, "vite.config.ts"), "utf8");
    expect(config).toContain("injectHomeStaticHtml");
    expect(config).toContain("homeStaticBody");
  });
});
