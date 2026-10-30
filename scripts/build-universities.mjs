// 生成 public/data/universities.json：省 → 市 → 学校列表
//
// 数据来源：github.com/vczero/serverless-colleage（按行政区整理的高校名单，
// 含 location 字段）。只在构建期跑一次，产物提交进仓库，线上不再依外网。
//
// 用法：node scripts/build-universities.mjs

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const RAW = "https://raw.githubusercontent.com/vczero/serverless-colleage/master/";
const LIST_DIR = "各行政区大学列表/";

const PROVINCES = [
  "北京市", "天津市", "河北省", "山西省", "内蒙古自治区", "辽宁省", "吉林省", "黑龙江省",
  "上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "广西壮族自治区", "海南省", "重庆市", "四川省", "贵州省",
  "云南省", "西藏自治区", "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区",
  "香港特别行政区", "澳门特别行政区", "台湾省",
];

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "user-agent": "chengdu-reader-build" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

const result = {};
let total = 0;

for (const province of PROVINCES) {
  const short = province.replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔|)$/g, "") || province;
  let data;
  try {
    data = await fetchJson(RAW + encodeURI(LIST_DIR + province + ".json"));
  } catch (error) {
    // 港澳台在源仓库里用简写文件名（如「台湾.json」），失败就退到简写再试一次
    try {
      data = await fetchJson(RAW + encodeURI(LIST_DIR + short + ".json"));
    } catch {
      console.warn(`skip ${province}: ${error.message}`);
      continue;
    }
  }
  const rows = Array.isArray(data?.datas) ? data.datas : [];
  if (!rows.length) continue;

  const cities = {};
  for (const row of rows) {
    const name = String(row?.name ?? "").trim();
    if (!name) continue;
    const city = String(row?.location ?? "").trim() || "其他";
    (cities[city] ??= []).push(name);
    total += 1;
  }
  for (const city of Object.keys(cities)) cities[city].sort((a, b) => a.localeCompare(b, "zh"));
  result[province] = cities;
}

const outDir = path.resolve("public/data");
await mkdir(outDir, { recursive: true });
const outFile = path.join(outDir, "universities.json");
await writeFile(outFile, JSON.stringify(result));
console.log(`wrote ${outFile}: ${Object.keys(result).length} provinces, ${total} schools`);
