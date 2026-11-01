import { z } from "zod";

export const ticketInput = z.object({
  kind: z.enum(["complaint", "appeal"]),
  subject: z.string().min(1).max(100),
  body: z.string().min(5).max(2000),
  /** 联系方式（邮箱/微信均可，可选） */
  contact: z.string().max(100).optional(),
  /** 涉及的标题或链接，便于核对 */
  ref: z.string().max(200).optional(),
  deviceId: z.string().max(64).optional(),
});

export type TicketInput = z.infer<typeof ticketInput>;

export interface TicketRecord extends TicketInput {
  id: string;
  at: string;
  status: "open" | "done";
}
