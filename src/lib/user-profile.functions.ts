// Editarea profilului: propriul profil sau, pentru adminul agenției, agenții din agenția lui.
// Permisiunea se verifică aici (și, suplimentar, de triggerul din baza de date).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { profileEditDenial, profileEditSchema } from "@/lib/user-profile";

type Ctx = { userId: string };

async function loadActorAndTarget(actorId: string, targetId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [ap, ar, tp, tr] = await Promise.all([
    supabaseAdmin.from("profiles").select("organization_id").eq("id", actorId).maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", actorId),
    supabaseAdmin
      .from("profiles")
      .select("id,organization_id,full_name,phone,job_title,avatar_url")
      .eq("id", targetId)
      .maybeSingle(),
    supabaseAdmin.from("user_roles").select("role").eq("user_id", targetId),
  ]);
  if (!tp.data) throw new Error("Utilizatorul nu există.");
  const denial = profileEditDenial(
    {
      id: actorId,
      organizationId: ap.data?.organization_id ?? null,
      roles: (ar.data ?? []).map((r) => r.role as string),
    },
    {
      id: targetId,
      organizationId: tp.data.organization_id,
      roles: (tr.data ?? []).map((r) => r.role as string),
    },
  );
  if (denial) throw new Error(denial);
  return { admin: supabaseAdmin, before: tp.data };
}

export const updateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => profileEditSchema.parse(data))
  .handler(async ({ data, context }) => {
    const actorId = (context as unknown as Ctx).userId;
    const { admin, before } = await loadActorAndTarget(actorId, data.userId);
    const next = {
      full_name: data.full_name,
      phone: data.phone,
      job_title: data.job_title?.trim() || null,
    };
    const { error } = await admin.from("profiles").update(next).eq("id", data.userId);
    if (error) throw new Error(error.message);
    const changed = (Object.keys(next) as (keyof typeof next)[]).filter(
      (k) => (before[k] ?? null) !== next[k],
    );
    if (changed.length) {
      await admin.from("audit_logs").insert({
        organization_id: before.organization_id,
        actor_id: actorId,
        action: actorId === data.userId ? "profile.self_updated" : "profile.updated_by_admin",
        entity: "profiles",
        entity_id: data.userId,
        old_values: Object.fromEntries(changed.map((k) => [k, before[k] ?? null])),
        new_values: { ...Object.fromEntries(changed.map((k) => [k, next[k]])), fields: changed.join(",") },
        created_by: actorId,
      });
    }
    return { ok: true as const, changed };
  });

export const setUserProfileAvatar = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ userId: z.string().uuid(), jpegBase64: z.string().max(7_000_000).nullable() })
      .strict()
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ avatarUrl: string | null }> => {
    const actorId = (context as unknown as Ctx).userId;
    const { admin, before } = await loadActorAndTarget(actorId, data.userId);
    let path: string | null = null;
    if (data.jpegBase64 !== null) {
      const bytes = Buffer.from(data.jpegBase64, "base64");
      if (bytes.byteLength === 0) throw new Error("Imaginea este goală.");
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Imaginea depășește 5 MB.");
      path = `${before.organization_id ?? "platform"}/${data.userId}/avatar-${Date.now()}.jpg`;
      const up = await admin.storage
        .from("avatars")
        .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
      if (up.error) throw new Error("Fotografia nu a putut fi încărcată.");
    }
    const { error } = await admin.from("profiles").update({ avatar_url: path }).eq("id", data.userId);
    if (error) {
      if (path) await admin.storage.from("avatars").remove([path]);
      throw new Error(error.message);
    }
    if (before.avatar_url && before.avatar_url !== path) {
      await admin.storage.from("avatars").remove([before.avatar_url]);
    }
    await admin.from("audit_logs").insert({
      organization_id: before.organization_id,
      actor_id: actorId,
      action: path ? "profile.avatar_updated" : "profile.avatar_removed",
      entity: "profiles",
      entity_id: data.userId,
      old_values: { avatar_url: before.avatar_url },
      new_values: { avatar_url: path, fields: "avatar_url" },
      created_by: actorId,
    });
    return { avatarUrl: path };
  });
