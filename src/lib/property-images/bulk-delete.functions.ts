import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { bulkDeletePropertyImages, MAX_BULK_IMAGE_DELETE } from "./bulk-delete";

const uuid = /^[0-9a-f-]{36}$/i;

export const deletePropertyImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { propertyId: string; imageIds: string[] }) => {
    if (typeof input?.propertyId !== "string" || !uuid.test(input.propertyId)) throw new Error("Anunț invalid.");
    const ids = [...new Set((input.imageIds ?? []).filter((x) => typeof x === "string" && uuid.test(x)))];
    if (ids.length === 0) throw new Error("Selectează cel puțin o fotografie.");
    if (ids.length > MAX_BULK_IMAGE_DELETE) throw new Error(`Poți șterge maximum ${MAX_BULK_IMAGE_DELETE} de fotografii odată.`);
    return { propertyId: input.propertyId, imageIds: ids };
  })
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const MEDIA_BUCKET = "property-media";
    return bulkDeletePropertyImages({
      deleteRows: async (propertyId, imageIds) => {
        const { data: paths, error } = await supabase.rpc("delete_property_images", { _property: propertyId, _image_ids: imageIds });
        if (error) throw new Error(error.message);
        return (paths ?? []) as string[];
      },
      removeFiles: async (paths) => {
        const { error } = await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(paths);
        if (error) throw error;
      },
      loadProperty: async (propertyId) => {
        const { data: row } = await supabaseAdmin.from("properties").select("organization_id,publish_status").eq("id", propertyId).maybeSingle();
        return row ? { organizationId: row.organization_id as string, publishStatus: (row.publish_status as string | null) ?? null } : null;
      },
      enqueuePortalUpdates: async (organizationId, propertyId) => {
        const { data: isSuper } = await supabase.rpc("is_superadmin");
        const { enqueueContactUpdates } = await import("@/lib/portals/contact-update.server");
        await enqueueContactUpdates(supabaseAdmin, { organizationId, propertyIds: [propertyId], actorId: context.userId, superadmin: isSuper === true });
      },
    }, data.propertyId, data.imageIds);
  });
