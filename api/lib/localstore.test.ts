import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLocalStore } from "./localstore";

let dir = "";

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cd-store-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("createLocalStore", () => {
  it("读写删的基本语义与 KV 一致", async () => {
    const store = createLocalStore(dir, "t");
    expect(await store.get("k")).toBeNull();
    await store.put("k", "v");
    expect(await store.get("k")).toBe("v");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });

  it("按前缀筛选并按游标翻页", async () => {
    const store = createLocalStore(dir, "t");
    await store.put("a:1", "1");
    await store.put("a:2", "2");
    await store.put("a:3", "3");
    await store.put("b:1", "x");

    const first = await store.list({ prefix: "a:", limit: 2 });
    expect(first.keys.map((item) => item.name)).toEqual(["a:1", "a:2"]);
    expect(first.list_complete).toBe(false);

    const second = await store.list({ prefix: "a:", limit: 2, cursor: first.cursor });
    expect(second.keys.map((item) => item.name)).toEqual(["a:3"]);
    expect(second.list_complete).toBe(true);
  });

  it("重启后仍读得到（落盘而不是只放内存）", async () => {
    const first = createLocalStore(dir, "persist");
    await first.put("k", "v");

    const second = createLocalStore(dir, "persist");
    expect(await second.get("k")).toBe("v");
  });

  it("并发写不会互相覆盖", async () => {
    const store = createLocalStore(dir, "t");
    await Promise.all(Array.from({ length: 20 }, (_, index) => store.put(`k${index}`, String(index))));
    const listed = await store.list({ prefix: "k", limit: 100 });
    expect(listed.keys).toHaveLength(20);
  });

  it("文件损坏时退化成空库，不抛错", async () => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "{not json", "utf8");
    const store = createLocalStore(dir, "broken");
    expect(await store.get("k")).toBeNull();
    await store.put("k", "v");
    expect(await store.get("k")).toBe("v");
  });
});
