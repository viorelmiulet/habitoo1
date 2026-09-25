export const MAIL_DENIED = "Acces refuzat: acțiunea este permisă exclusiv superadminului.";

/**
 * Authorization first, privileged client second — never the other way round.
 * `is_superadmin()` runs as the caller (RLS client), so an agency user can
 * never obtain the service-role client through a Mail Center function.
 */
export async function requireMailSuperadmin(context: {
  supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: unknown }> };
}) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) throw new Error(MAIL_DENIED);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
