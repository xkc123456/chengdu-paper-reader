import { createRouter, publicQuery } from "./middleware";
import { paperRouter } from "./paperRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  paper: paperRouter,
});

export type AppRouter = typeof appRouter;
