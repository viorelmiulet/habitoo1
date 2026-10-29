import { downloadZupCatalogue } from "./nomenclature";
import { zupGet } from "./oauth.server";
import { zupDependencies } from "./store.server";
export async function synchronizeZup(org: string, actor: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const deps = await zupDependencies();
  try {
    const downloaded = await downloadZupCatalogue(path => zupGet(org,path,deps));
    const { data, error } = await db.rpc("zup_nomenclature_apply", { _snapshot: downloaded.snapshot as never, _raw: downloaded.raw as never, _actor: actor, _organization: org });
    if (error) throw new Error("Nomenclatorul ZUP nu a putut fi salvat; datele anterioare au rămas intacte.");
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sincronizarea ZUP a eșuat.";
    const { error: audit } = await db.from("zup_nomenclature_syncs").insert({ organization_id: org, created_by: actor, success: false, error_message: message });
    if (audit) throw new Error(`${message} Înregistrarea erorii nu a putut fi salvată.`);
    throw new Error(message);
  }
}