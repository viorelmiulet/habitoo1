import { createServerFn } from "@tanstack/react-start";

export const listPublicPartners = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicPartners } = await import("@/lib/public-partners.server");
  return loadPublicPartners();
});
