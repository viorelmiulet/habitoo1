// Server functions for the Superadmin "QA / Demo Data" panel.
// Every handler re-verifies the real superadmin role server-side (via RLS-backed RPC) before
// touching the service-role client, and every seed / reset / purge is written to the audit log.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DemoCredential, QaStatus, SeedSummary } from "@/lib/qa-seed.server";

type AuthContext = {
  supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }> };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
  return context.userId;
}

async function loadServer() {
  const [{ supabaseAdmin }, seed] = await Promise.all([
    import("@/integrations/supabase/client.server"),
    import("@/lib/qa-seed.server"),
  ]);
  return { admin: supabaseAdmin, seed };
}

export const getQaStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QaStatus> => {
    await assertSuperadmin(context);
    const { admin, seed } = await loadServer();
    return seed.collectQaStatus(admin);
  });

export type SeedResult = {
  organizationId: string;
  organizationName: string;
  mode: "seed" | "reset";
  credentials: DemoCredential[];
  summary: SeedSummary;
  removed?: Record<string, number>;
};

/**
 * Populează agenția QA cu date demo.
 * - mode "seed": creează agenția QA dacă nu există și o populează (refuză dacă a fost deja populată).
 * - mode "reset": șterge toate datele operaționale ale agenției QA (verificare is_demo în DB) și re-populează.
 */
export const seedQaDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ mode: z.enum(["seed", "reset"]) }).parse(data))
  .handler(async ({ data, context }): Promise<SeedResult> => {
    const actorId = await assertSuperadmin(context);
    const { admin, seed } = await loadServer();

    let org = await seed.findQaOrganization(admin);
    let removed: Record<string, number> | undefined;

    if (!org) {
      org = await seed.createQaOrganization(admin, actorId);
      await seed.writeQaAudit(admin, { actorId, action: "qa.org_created", orgId: org.id, values: { name: org.name, slug: org.slug } });
    } else if (org.demo_seeded_at && data.mode !== "reset") {
      throw new Error("Agenția QA este deja populată. Folosește „Resetare date demo” pentru a o repopula.");
    } else {
      // Reset explicit sau curățarea resturilor unui seed anterior eșuat (agenția există, dar nu e marcată ca populată).
      // Funcția DB refuză orice organizație fără is_demo = true.
      removed = await seed.resetQaData(admin, org.id);
      const removedTotal = Object.values(removed).reduce((a, b) => a + b, 0);
      if (data.mode === "reset" || removedTotal > 0) {
        await seed.writeQaAudit(admin, { actorId, action: "qa.reset", orgId: org.id, values: { removed, mode: data.mode } });
      }
    }

    const users = await seed.ensureDemoUsers(admin, org.id, { rotatePasswords: false });
    const summary = await seed.seedQaData(admin, org.id, users.ids, actorId);
    await seed.writeQaAudit(admin, {
      actorId,
      action: data.mode === "reset" ? "qa.reseeded" : "qa.seeded",
      orgId: org.id,
      values: { counts: summary.counts, version: seed.QA_SEED_VERSION, users_created: users.credentials.filter((c) => c.created).length },
    });

    return {
      organizationId: org.id,
      organizationName: org.name,
      mode: data.mode,
      credentials: users.credentials,
      summary,
      removed,
    };
  });

/** Regenerează parolele conturilor demo (doar conturile @demo, niciodată superadmini). */
export const rotateQaPasswords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ credentials: DemoCredential[] }> => {
    const actorId = await assertSuperadmin(context);
    const { admin, seed } = await loadServer();
    const org = await seed.findQaOrganization(admin);
    if (!org) throw new Error("Nu există o agenție QA. Populează mai întâi datele demo.");
    const users = await seed.ensureDemoUsers(admin, org.id, { rotatePasswords: true });
    await seed.writeQaAudit(admin, { actorId, action: "qa.credentials_rotated", orgId: org.id, values: { users: users.credentials.map((c) => c.email) } });
    return { credentials: users.credentials };
  });

/** Șterge complet agenția QA (date, fișiere, conturi demo). Necesită confirmare explicită. */
export const purgeQaDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ confirmation: z.literal("ȘTERGE") }).parse(data))
  .handler(async ({ context }): Promise<{ deletedUsers: number; organizationName: string }> => {
    const actorId = await assertSuperadmin(context);
    const { admin, seed } = await loadServer();
    const org = await seed.findQaOrganization(admin);
    if (!org) throw new Error("Nu există o agenție QA de curățat.");
    const result = await seed.purgeQaOrganization(admin, org.id);
    await seed.writeQaAudit(admin, {
      actorId,
      action: "qa.purged",
      orgId: org.id,
      values: { name: org.name, deleted_users: result.deletedUsers },
    });
    return { deletedUsers: result.deletedUsers, organizationName: org.name };
  });
