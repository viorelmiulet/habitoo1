// Editarea datelor unei agenții de către superadmin, cu audit per câmp.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNoActiveImpersonation } from "@/lib/impersonation.functions";
import { AGENCY_DETAIL_FIELDS, agencyDetailsSchema, diffAgencyDetails } from "@/lib/agency-details";

const LOGO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

const inputSchema = z.object({
  organizationId: z.string().uuid(),
  details: agencyDetailsSchema,
  logo: z
    .object({ mimeType: z.string(), base64: z.string().max(3_000_000) })
    .nullable()
    .optional(),
  removeLogo: z.boolean().optional(),
});

type Ctx = {
  supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }> };
  userId: string;
};

export const saveAgencyDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as Ctx;
    const { data: isSuper, error: roleError } = await supabase.rpc("is_superadmin");
    if (roleError || isSuper !== true) {
      throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
    }
    await assertNoActiveImpersonation(userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: before, error } = await supabaseAdmin
      .from("organizations")
      .select("*")
      .eq("id", data.organizationId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!before) throw new Error("Agenția nu există.");

    const patch: Record<string, unknown> = { ...data.details, updated_by: userId };
    const cui = data.details.cui;
    if (cui) patch.cui = cui.toUpperCase();

    let uploadedPath: string | null = null;
    if (data.logo) {
      const ext = LOGO_TYPES[data.logo.mimeType];
      if (!ext) throw new Error("Folosește un fișier JPG, PNG, SVG sau WebP.");
      const bytes = Buffer.from(data.logo.base64, "base64");
      if (bytes.byteLength > 2 * 1024 * 1024) throw new Error("Fișierul depășește 2 MB.");
      uploadedPath = `${data.organizationId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("agency-logos")
        .upload(uploadedPath, bytes, { contentType: data.logo.mimeType, upsert: false });
      if (upErr) throw new Error("Logo-ul nu a putut fi încărcat.");
      patch.logo_path = uploadedPath;
    } else if (data.removeLogo) {
      patch.logo_path = null;
    }

    const fields = [...AGENCY_DETAIL_FIELDS, "logo_path"];
    const diff = diffAgencyDetails(before as Record<string, unknown>, patch, fields.filter((f) => f in patch));
    if (diff.changed.length === 0) return { changed: [] as string[] };

    const { error: updErr } = await supabaseAdmin
      .from("organizations")
      .update(patch as never)
      .eq("id", data.organizationId);
    if (updErr) {
      if (uploadedPath) await supabaseAdmin.storage.from("agency-logos").remove([uploadedPath]);
      throw new Error(updErr.message);
    }

    const previousLogo = (before as { logo_path?: string | null }).logo_path;
    if (diff.changed.includes("logo_path") && previousLogo) {
      await supabaseAdmin.storage.from("agency-logos").remove([previousLogo]);
    }

    await supabaseAdmin.from("audit_logs").insert({
      organization_id: data.organizationId,
      actor_id: userId,
      action: "organization.details_updated",
      entity: "organizations",
      entity_id: data.organizationId,
      old_values: diff.oldValues,
      new_values: diff.newValues,
    } as never);

    return { changed: diff.changed };
  });
