import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { clipInputSchema } from "./generated-video-clips";

export const saveGeneratedClip = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input) => clipInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { recordGeneratedClip } = await import("./generated-video-clips.server");
    return recordGeneratedClip(context.supabase, context.userId, data);
  });

export const getGeneratedClips = createServerFn({ method: "GET" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((input) => z.object({ page: z.number().int().min(1).max(100000) }).parse(input))
  .handler(async ({ data, context }) => {
    const { listGeneratedClips } = await import("./generated-video-clips.server");
    return listGeneratedClips(context.supabase, context.userId, data.page);
  });