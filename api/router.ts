import { createRouter, publicQuery } from "./middleware";
import { paperRouter } from "./paperRouter";
import { profileRouter } from "./profileRouter";
import { consentRouter } from "./consentRouter";
import { archiveRouter } from "./archiveRouter";
import { readLock } from "./lib/lock";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  site: createRouter({
    /** 前端启动时查一次：站点是否被后台暂停 */
    status: publicQuery.query(async ({ ctx }) => readLock(ctx.env?.PROFILES)),
  }),
  paper: paperRouter,
  profile: profileRouter,
  consent: consentRouter,
  archive: archiveRouter,
});

export type AppRouter = typeof appRouter;
