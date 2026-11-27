import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authCreateErrorMessage, createAgencyCore, createAgencySchema, isEmailInUseError } from "@/lib/superadmin-create-agency";

export const superadminCreateAgency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createAgencySchema.parse(input))
  .handler(async ({ data, context }) => {
    return createAgencyCore(
      {
        isSuperadmin: async () => {
          const { data: ok, error } = await context.supabase.rpc("is_superadmin");
          return !error && ok === true;
        },
        createAuthUser: async (email, password) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: res, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
          if (error || !res.user) {
            console.error("superadminCreateAgency: createUser failed", { code: error?.code ?? null, status: error?.status ?? null });
            return { error: authCreateErrorMessage(error, password), emailInUse: isEmailInUseError(error) };
          }
          return { id: res.user.id };
        },
        createAgencyRows: async (userId, i) => {
          const { data: orgId, error } = await context.supabase.rpc("superadmin_create_agency", {
            _user_id: userId, _email: i.email, _name: i.name,
            _legal_name: i.legal_name ?? "", _cui: i.cui ?? "", _trade_registry_number: i.trade_registry_number ?? "",
            _phone: i.phone ?? "", _city: i.city ?? "", _full_name: i.full_name ?? "",
            _plan: i.plan ?? "basic", _term: i.term ?? "trial_90d",
          });
          if (error || !orgId) throw new Error(error?.message ?? "fără rezultat");
          return orgId as string;
        },
        deleteAuthUser: async (userId) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
          if (error) console.error("superadminCreateAgency: rollback deleteUser failed", userId);
        },
      },
      data,
    );
  });
