import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PortalError } from "../errors";
import { IMOBILIARE_PORTAL_KEY } from "./config";

type Admin = SupabaseClient<Database>;

export async function withDurableImobiliareLock<T>(input: {
  admin: Admin;
  organizationId: string;
  reference: string;
  run: () => Promise<T>;
}): Promise<T> {
  const ownerToken = crypto.randomUUID();
  const { data, error } = await input.admin.rpc("acquire_portal_operation_lock" as never, {
    _organization_id: input.organizationId,
    _portal: IMOBILIARE_PORTAL_KEY,
    _lock_key: input.reference,
    _owner_token: ownerToken,
    _ttl_seconds: 120,
  } as never);
  if (error) {
    throw new PortalError(
      "PORTAL_ERROR",
      "Blocarea operației Imobiliare.ro nu a putut fi inițializată.",
    );
  }
  if (data !== true) {
    throw new PortalError(
      "RATE_LIMIT",
      "O altă operație pentru acest anunț este în curs. Reîncearcă după finalizarea ei.",
    );
  }
  try {
    return await input.run();
  } finally {
    await input.admin.rpc("release_portal_operation_lock" as never, {
      _organization_id: input.organizationId,
      _portal: IMOBILIARE_PORTAL_KEY,
      _lock_key: input.reference,
      _owner_token: ownerToken,
    } as never);
  }
}