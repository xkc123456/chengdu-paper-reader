import { z } from "zod";
import { analysisSchema } from "./analysis";

/**
 * 云存档：用户主动点「存到云端」才会写进来的一份副本。
 * 只认「解析结果 + 原文（可选）」，不含院校信息，也不含 Key。
 */
export const archivePaperSchema = z.object({
  id: z.string().min(6).max(64),
  title: z.string().min(1).max(200),
  field: z.string().max(20),
  createdAt: z.number().int(),
  /** 原文可选：用户勾选「连原文一起存」才有 */
  sourceText: z.string().max(200_000).optional(),
  result: analysisSchema,
});

export const archiveSaveInput = z.object({
  deviceId: z.string().min(8).max(64),
  paper: archivePaperSchema,
});

export const archiveGetInput = z.object({
  deviceId: z.string().min(8).max(64),
  id: z.string().min(6).max(64),
});

export type ArchivedPaper = z.infer<typeof archivePaperSchema>;

/** 列表只读这一份，避免把正文全部拉出来 */
export interface ArchiveMeta {
  id: string;
  title: string;
  field: string;
  at: string;
  deviceId: string;
  size: number;
  hasSource: boolean;
}

export interface ArchiveRecord extends ArchiveMeta {
  paper: ArchivedPaper;
}

export interface TakedownRecord {
  at: string;
  id: string;
  title: string;
  reason: string;
  /** 谁发起的：admin（站长）/ user（用户自己删）/ complaint（权利人投诉） */
  operator?: string;
  /** 发现来源：complaint（投诉）/ patrol（巡查）/ report（举报）/ self（本人） */
  source?: string;
  /** 投诉人/请求方（可选，便于举证） */
  requester?: string;
  /** 内容归属的设备（用于给用户提示，不含身份信息） */
  deviceId?: string;
  /** 下架时是否同时撤销了公开链接 */
  shareRevoked?: boolean;
}
