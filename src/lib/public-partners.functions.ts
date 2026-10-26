import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const listPublicPartners = createServerFn({ method: "GET" }).handler(async () => {
  const { loadPublicPartners } = await import("@/lib/public-partners.server");
  const { publicRead } = await import("@/lib/public-read");
  return publicRead("public_partner_agencies", loadPublicPartners, []);
});

export const fetchAgencyProfile = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { loadAgencyProfile } = await import("@/lib/public-partners.server");
    const { publicRead } = await import("@/lib/public-read");
    return publicRead("public_agency_profile", () => loadAgencyProfile(data.slug), null);
  });

export const getHasPublicPartners = createServerFn({ method: "GET" }).handler(async () => {
  const { hasPublicPartners } = await import("@/lib/public-partners.server");
  return hasPublicPartners();
});
