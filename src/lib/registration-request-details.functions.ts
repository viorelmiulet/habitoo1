/**
 * Detaliile complete ale unei cereri de înscriere agenție, doar pentru
 * superadmin: cererea, datele firmei (ANAF + organizație), organizația creată
 * și contactul utilizatorului. Doar citire; nu expune date din alte agenții.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthContext = {
  supabase: {
    rpc: (
      fn: "is_superadmin",
    ) => PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
  };
  userId: string;
};

async function assertSuperadmin(context: AuthContext) {
  const { data, error } = await context.supabase.rpc("is_superadmin");
  if (error || data !== true) {
    throw new Error("Acces refuzat: acțiunea este permisă exclusiv superadminului.");
  }
}

export type RegistrationRequestDetails = {
  request: {
    id: string;
    agencyName: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    requestedPlan: string;
    requestedTerm: string;
    createdAt: string;
    status: string;
    reviewedByName: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
  };
  company: {
    legalName: string;
    cui: string;
    tradeRegistryNumber: string;
    registeredAddress: string | null;
    city: string | null;
    county: string | null;
    postalCode: string | null;
    companyStatus: string | null;
    companyStatusSince: string | null;
    companyVerifiedAt: string | null;
  };
  organization: {
    id: string;
    name: string;
    status: string;
    plan: string;
    isTrial: boolean;
    subscriptionStartedAt: string | null;
    subscriptionExpiresAt: string | null;
    collaborationEnabled: boolean;
    userCount: number;
    propertyCount: number;
  } | null;
  contact: {
    loginEmail: string | null;
    provider: "email" | "google" | null;
  };
};

export const getRegistrationRequestDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ requestId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<RegistrationRequestDetails> => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");

    const { data: req, error } = await admin
      .from("agency_registration_requests")
      .select("*")
      .eq("id", data.requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Cererea nu a fost găsită.");

    const [reviewerRes, orgRes, userRes] = await Promise.all([
      req.reviewed_by
        ? admin.from("profiles").select("full_name").eq("id", req.reviewed_by).maybeSingle()
        : Promise.resolve({ data: null }),
      req.organization_id
        ? admin
            .from("organizations")
            .select(
              "id,name,status,plan,is_trial,subscription_started_at,subscription_expires_at,collaboration_enabled,legal_name,cui,trade_registry_number,registered_address,city,county,postal_code,company_status,company_status_since,company_verified_at",
            )
            .eq("id", req.organization_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin.auth.admin.getUserById(req.user_id).catch(() => ({ data: { user: null } })),
    ]);

    const org = orgRes.data;
    let userCount = 0;
    let propertyCount = 0;
    if (org) {
      const [u, p] = await Promise.all([
        admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id),
        admin
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org.id)
          .is("deleted_at", null),
      ]);
      userCount = u.count ?? 0;
      propertyCount = p.count ?? 0;
    }

    const authUser = userRes.data?.user ?? null;
    const provider = (authUser?.app_metadata?.provider as string | undefined) ?? null;

    return {
      request: {
        id: req.id,
        agencyName: req.agency_name,
        fullName: req.full_name,
        email: req.email,
        phone: req.phone,
        requestedPlan: req.requested_plan,
        requestedTerm: req.requested_term,
        createdAt: req.created_at,
        status: req.status,
        reviewedByName: reviewerRes.data?.full_name ?? null,
        reviewedAt: req.reviewed_at,
        rejectionReason: req.rejection_reason,
      },
      company: {
        legalName: org?.legal_name ?? req.legal_name,
        cui: org?.cui ?? req.cui,
        tradeRegistryNumber: org?.trade_registry_number ?? req.trade_registry_number,
        registeredAddress: org?.registered_address ?? null,
        city: org?.city ?? null,
        county: org?.county ?? null,
        postalCode: org?.postal_code ?? null,
        companyStatus: org?.company_status ?? null,
        companyStatusSince: org?.company_status_since ?? null,
        companyVerifiedAt: org?.company_verified_at ?? null,
      },
      organization: org
        ? {
            id: org.id,
            name: org.name,
            status: org.status,
            plan: org.plan,
            isTrial: org.is_trial,
            subscriptionStartedAt: org.subscription_started_at,
            subscriptionExpiresAt: org.subscription_expires_at,
            collaborationEnabled: org.collaboration_enabled,
            userCount,
            propertyCount,
          }
        : null,
      contact: {
        loginEmail: authUser?.email ?? null,
        provider: provider === "google" ? "google" : provider === "email" ? "email" : null,
      },
    };
  });
