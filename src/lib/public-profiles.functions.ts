import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const page = z.number().int().min(1).max(1000).default(1);
export const fetchAgencyPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(200), page }).parse(d))
  .handler(async ({ data }) => {
    const { loadAgencyPage } = await import("@/lib/public-profiles.server");
    const { publicRead } = await import("@/lib/public-read");
    return publicRead("public_agency_page", () => loadAgencyPage(data.slug.toLowerCase(), data.page), null);
  });
export const fetchAgentPage = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1).max(200), agent: z.string().min(1).max(200), page }).parse(d))
  .handler(async ({ data }) => {
    const { loadAgentPage } = await import("@/lib/public-profiles.server");
    const { publicRead } = await import("@/lib/public-read");
    return publicRead("public_agent_page", () => loadAgentPage(data.slug.toLowerCase(), data.agent.toLowerCase(), data.page), null);
  });
