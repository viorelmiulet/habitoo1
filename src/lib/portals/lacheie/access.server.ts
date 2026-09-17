/**
 * Drepturile de acces pentru integrarea La Cheie, separate în două:
 *
 *  - `requireLaCheieSuperadmin` — administrarea (jurnal, versiuni, catalog,
 *    testare, dezactivare) rămâne strict la Superadmin;
 *  - `requireLaCheieActivator` — activarea și citirea stării proprii sunt
 *    permise Superadminului sau unui `agency_admin`. Pentru non-superadmini
 *    agenția vine EXCLUSIV din sesiune (agenția activă a profilului), iar rolul
 *    se verifică pentru ACEA agenție; un `organizationId` trimis de client care
 *    nu corespunde este refuzat.
 */
export type LaCheieAuthContext = {
  supabase: {
    rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: unknown }>;
  };
  userId: string;
};

type QueryResult<T> = PromiseLike<{ data: T | null; error?: unknown }>;

export type LaCheieAccessAdmin = {
  from: (table: string) => any;
};

export type LaCheieAccessDeps = { admin: LaCheieAccessAdmin };

export const LACHEIE_ACCESS_SUPERADMIN_ONLY =
  "Acces refuzat: integrarea La Cheie se administrează de Superadmin.";
export const LACHEIE_ACCESS_ACTIVATOR_ONLY =
  "Acces refuzat: activarea La Cheie se solicită de administratorul agenției sau de Superadmin.";
export const LACHEIE_ACCESS_ORG_MISSING = "Agenția nu a fost găsită.";
export const LACHEIE_ACCESS_SELECT_ORG = "Selectează agenția.";

async function defaultDeps(): Promise<LaCheieAccessDeps> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return { admin: supabaseAdmin as unknown as LaCheieAccessAdmin };
}

async function existingOrg(admin: LaCheieAccessAdmin, organizationId: string): Promise<string> {
  const { data } = (await admin
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle()) as Awaited<QueryResult<{ id: string }>>;
  if (!data?.id) throw new Error(LACHEIE_ACCESS_ORG_MISSING);
  return data.id;
}

async function isSuperadmin(context: LaCheieAuthContext): Promise<boolean> {
  const { data } = await context.supabase.rpc("is_superadmin");
  return data === true;
}

export async function requireLaCheieSuperadmin(
  context: LaCheieAuthContext,
  organizationId: string,
  deps?: LaCheieAccessDeps,
): Promise<string> {
  if (!(await isSuperadmin(context))) throw new Error(LACHEIE_ACCESS_SUPERADMIN_ONLY);
  const { admin } = deps ?? (await defaultDeps());
  return existingOrg(admin, organizationId);
}

export async function requireLaCheieActivator(
  context: LaCheieAuthContext,
  requestedOrganizationId?: string | null,
  deps?: LaCheieAccessDeps,
): Promise<string> {
  const { admin } = deps ?? (await defaultDeps());
  if (await isSuperadmin(context)) {
    if (!requestedOrganizationId) throw new Error(LACHEIE_ACCESS_SELECT_ORG);
    return existingOrg(admin, requestedOrganizationId);
  }

  // Agenția activă a sesiunii, nu una aleasă din toate rolurile utilizatorului.
  const { data: profile } = (await admin
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle()) as Awaited<QueryResult<{ organization_id: string | null }>>;
  const sessionOrg = profile?.organization_id ?? null;
  if (!sessionOrg) throw new Error(LACHEIE_ACCESS_ACTIVATOR_ONLY);
  if (requestedOrganizationId && requestedOrganizationId !== sessionOrg) {
    throw new Error(LACHEIE_ACCESS_ACTIVATOR_ONLY);
  }

  const { data: role } = (await admin
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", context.userId)
    .eq("organization_id", sessionOrg)
    .eq("role", "agency_admin")
    .maybeSingle()) as Awaited<QueryResult<{ organization_id: string | null }>>;
  if (!role?.organization_id) throw new Error(LACHEIE_ACCESS_ACTIVATOR_ONLY);

  return existingOrg(admin, sessionOrg);
}
