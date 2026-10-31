import { z } from "zod";
import { analysisSchema } from "./analysis";

export const shareCreateInput = z.object({
  deviceId: z.string().min(8).max(64),
  /** 分享的是一份云存档；没有存档就不允许分享，下架时才能级联 */
  archiveId: z.string().min(6).max(64),
  title: z.string().min(1).max(200),
  field: z.string().max(20),
  result: analysisSchema,
  expiresInDays: z.union([z.literal(7), z.literal(30), z.null()]).default(null),
});

export const shareCreateOutput = z.object({
  id: z.string().length(10),
  url: z.string(),
  deleteToken: z.string(),
  expiresAt: z.number().nullable(),
});

export const shareGetInput = z.object({ id: z.string().min(6).max(16) });

export const shareGetOutput = z.object({
  title: z.string(),
  field: z.string(),
  createdAt: z.number(),
  expiresAt: z.number().nullable(),
  result: analysisSchema,
});

export const shareRemoveInput = z.object({
  id: z.string().min(6).max(16),
  token: z.string().min(16).max(64),
});
