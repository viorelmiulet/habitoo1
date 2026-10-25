import { createServerFn } from "@tanstack/react-start";

export const getPublicOwnerStatistics = createServerFn({ method: "GET" }).handler(async () => {
  const { loadLlmsStatistics } = await import("@/lib/blog-discovery.server");
  return { statistics: await loadLlmsStatistics(), observedAt: new Date().toISOString() };
});