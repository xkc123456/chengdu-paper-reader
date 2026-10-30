import { createRouter, publicQuery } from "./middleware";
import { paperRouter } from "./paperRouter";
import { profileRouter } from "./profileRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  paper: paperRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
