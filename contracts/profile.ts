import { z } from "zod";

/** 学历层次：前端下拉与后端校验共用一份，避免两边漂移 */
export const DEGREES = ["专科", "本科", "硕士研究生", "博士研究生及以上"] as const;

export type Degree = (typeof DEGREES)[number];

export const profileSchema = z.object({
  /** 省 / 直辖市 / 香港特别行政区 / 澳门特别行政区 / 中国台湾地区 / 海外 */
  region: z.string().min(1).max(32),
  city: z.string().max(32).default(""),
  school: z.string().min(1).max(64),
  /** 学院，选填 */
  college: z.string().max(64).default(""),
  major: z.string().min(1).max(64),
  degree: z.enum(DEGREES),
});

export type ProfileInput = z.infer<typeof profileSchema>;
