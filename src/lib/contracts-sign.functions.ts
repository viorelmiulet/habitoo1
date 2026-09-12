/**
 * Semnare la distanță — flux public, fără autentificare.
 * Accesul se face exclusiv cu tokenul din email: hash SHA-256 în baza de date,
 * valabil 7 zile și consumat o singură dată. Nu expune date de identitate.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { CONTRACTS_BUCKET, renderAndStorePdf } from "@/lib/contracts.functions";
import { contractKindLabels, partyRoleLabels } from "@/lib/contracts/templates";

const tokenSchema = z.string().trim().min(20).max(200);

async function resolveToken(token: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { sha256Hex } = await import("@/lib/contracts/crypto.server");
  const { data: row } = await db
    .from("contract_signature_tokens")
    .select("*")
    .eq("token_hash", sha256Hex(token))
    .maybeSingle();
  return { db, row };
}

export type SignatureRequestView =
  | { state: "invalid" | "used" | "expired" | "cancelled" }
  | {
      state: "ready" | "signed";
      contractTitle: string;
      contractKind: string;
      agencyName: string;
      partyName: string;
      partyRole: string;
      documentUrl: string | null;
      signedAt: string | null;
    };

export const getSignatureRequest = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: tokenSchema }).parse(data))
  .handler(async ({ data }): Promise<SignatureRequestView> => {
    const { db, row } = await resolveToken(data.token);
    if (!row) return { state: "invalid" };
    if (row.used_at) return { state: "used" };
    if (new Date(row.expires_at) <= new Date()) return { state: "expired" };

    const [{ data: contract }, { data: party }] = await Promise.all([
      db.from("contracts").select("*").eq("id", row.contract_id).maybeSingle(),
      db.from("contract_parties").select("*").eq("id", row.party_id).maybeSingle(),
    ]);
    if (!contract || !party) return { state: "invalid" };
    if (contract.status === "cancelled") return { state: "cancelled" };

    const { data: org } = await db
      .from("organizations")
      .select("name")
      .eq("id", contract.organization_id)
      .maybeSingle();

    const path = contract.signed_document_path ?? contract.document_path;
    let documentUrl: string | null = null;
    if (path) {
      const { data: signed } = await db.storage
        .from(CONTRACTS_BUCKET)
        .createSignedUrl(path, 3600);
      documentUrl = signed?.signedUrl ?? null;
    }

    return {
      state: party.signed_at ? "signed" : "ready",
      contractTitle: contract.title,
      contractKind: contractKindLabels[contract.kind] ?? "Document",
      agencyName: org?.name ?? "Agenție imobiliară",
      partyName: party.full_name,
      partyRole: partyRoleLabels[party.role] ?? party.role,
      documentUrl,
      signedAt: party.signed_at,
    };
  });

export const submitSignature = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: tokenSchema,
        signaturePngBase64: z.string().min(500).max(4_000_000),
        agreed: z.literal(true),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { db, row } = await resolveToken(data.token);
    if (!row) throw new Error("Link invalid.");
    if (row.used_at) throw new Error("Linkul a fost deja folosit.");
    if (new Date(row.expires_at) <= new Date()) throw new Error("Linkul a expirat.");

    const { data: contract } = await db
      .from("contracts")
      .select("*")
      .eq("id", row.contract_id)
      .single();
    if (!contract) throw new Error("Documentul nu există.");
    if (contract.status === "cancelled") throw new Error("Documentul a fost anulat.");

    const base64 = data.signaturePngBase64.replace(/^data:image\/png;base64,/, "");
    const bytes = Buffer.from(base64, "base64");
    const path = `${contract.organization_id}/${contract.id}/signatures/${row.party_id}.png`;
    const { error: uploadError } = await db.storage
      .from(CONTRACTS_BUCKET)
      .upload(path, new Blob([bytes as unknown as BlobPart], { type: "image/png" }), {
        contentType: "image/png",
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const now = new Date().toISOString();
    await db
      .from("contract_parties")
      .update({
        signed_at: now,
        signature_path: path,
        signature_ip: getRequestIP({ xForwardedFor: true }) ?? null,
        signature_user_agent: (getRequestHeader("user-agent") ?? "").slice(0, 300) || null,
      })
      .eq("id", row.party_id);
    await db
      .from("contract_signature_tokens")
      .update({ used_at: now })
      .eq("id", row.id);

    const { data: parties } = await db
      .from("contract_parties")
      .select("id,signed_at")
      .eq("contract_id", contract.id);
    const allSigned = (parties ?? []).every((p) => p.signed_at);

    await db
      .from("contracts")
      .update(
        allSigned
          ? { status: "signed", signed_at: now }
          : { status: "partially_signed" },
      )
      .eq("id", contract.id);

    // Documentul final se regenerează cu semnăturile aplicate.
    await renderAndStorePdf(contract.id, contract.created_by);

    await db.from("audit_logs").insert({
      organization_id: contract.organization_id,
      actor_id: null,
      action: "contract.signed_by_party",
      entity: "contracts",
      entity_id: contract.id,
      new_values: { party_id: row.party_id, all_signed: allSigned } as never,
    } as never);

    if (contract.created_by) {
      await db.from("notifications").insert({
        organization_id: contract.organization_id,
        user_id: contract.created_by,
        type: "contract",
        title: allSigned ? "Document semnat de toate părțile" : "Document semnat de o parte",
        body: contract.title,
        link: `/app/contracts/${contract.id}`,
      } as never);
    }

    return { allSigned };
  });
