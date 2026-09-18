/**
 * Executorii tool-urilor de marketing (Stage 16).
 *
 * AI-ul nu are acces direct la baza de date: toate datele trec prin aceste
 * tool-uri, care rulează server-side, filtrează explicit `organization_id` și
 * întorc numai câmpurile din lista albă. Proprietățile arhivate sau șterse nu
 * pot alimenta conținut de marketing.
 */
import type { AiActor, AiSource } from "../../gateway/types";
import { sanitizeCrmValue } from "../../security/injection";
import type { AiToolExecution } from "../../tools/executors.server";
import {
  buildMarketingFactSheet,
  marketingContextHash,
  missingMarketingData,
  validateMarketingFacts,
} from "./facts";

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Admin = Awaited<ReturnType<typeof loadAdmin>>;

/** Lista albă de câmpuri: doar ce este necesar pentru un anunț. */
const MARKETING_PROPERTY_FIELDS = [
  "id",
  "reference",
  "title",
  "description",
  "property_type",
  "category",
  "transaction_kind",
  "status",
  "price",
  "currency",
  "negotiable",
  "surface",
  "usable_surface",
  "built_surface",
  "land_surface",
  "balcony_surface",
  "terrace_surface",
  "rooms",
  "bedrooms",
  "bathrooms",
  "floor",
  "building_floors",
  "floor_label",
  "build_year",
  "renovation_year",
  "comfort",
  "furnishing",
  "heating",
  "heating_systems",
  "cooling_systems",
  "finish_state",
  "parking",
  "parking_spaces",
  "balconies",
  "terraces",
  "orientation",
  "views",
  "features",
  "utilities",
  "building_amenities",
  "appliances",
  "kitchen_features",
  "additional_spaces",
  "misc_features",
  "street_arrangement",
  "city",
  "county",
  "district",
  "tags",
  "archived_at",
  "deleted_at",
].join(",");

type PropertyRow = Record<string, unknown> & {
  id: string;
  archived_at?: string | null;
  deleted_at?: string | null;
  status?: string | null;
};

function propertyLabel(row: Record<string, unknown>): string {
  const reference = typeof row["reference"] === "string" ? row["reference"] : null;
  const title = typeof row["title"] === "string" ? row["title"] : null;
  return reference ?? title ?? "Proprietate";
}

function source(row: Record<string, unknown>): AiSource {
  return { type: "property", id: String(row["id"]), label: propertyLabel(row) };
}

/**
 * Încarcă o proprietate a agenției actorului. Filtrul de agenție este aplicat
 * pe lângă identificator: un ID din altă agenție nu întoarce niciodată date.
 */
export async function loadMarketingProperty(
  admin: Admin,
  actor: AiActor,
  propertyId: string,
): Promise<{ ok: true; row: PropertyRow } | { ok: false; error: string; code: "not_found" | "denied" }> {
  const { data } = await admin
    .from("properties")
    .select(MARKETING_PROPERTY_FIELDS)
    .eq("id", propertyId)
    .eq("organization_id", actor.organizationId)
    .maybeSingle();
  const row = data as PropertyRow | null;
  if (!row) return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
  if (row.deleted_at) {
    return { ok: false, error: "Proprietatea nu există în agenția ta.", code: "not_found" };
  }
  if (row.archived_at || row.status === "archived") {
    return {
      ok: false,
      error: "Proprietatea este arhivată. Marketingul este disponibil doar pentru proprietăți active.",
      code: "denied",
    };
  }
  return { ok: true, row };
}

async function imageCount(admin: Admin, actor: AiActor, propertyId: string): Promise<number> {
  const { count } = await admin
    .from("property_images")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", actor.organizationId)
    .eq("property_id", propertyId)
    .eq("is_confidential", false)
    .eq("include_in_publish", true);
  return count ?? 0;
}

/** Următoarea versiune liberă pentru istoricul de ciorne al unei proprietăți. */
async function nextDraftVersion(
  admin: Admin,
  organizationId: string,
  propertyId: string,
  channel: string,
  contentType: string,
): Promise<number> {
  const { data } = await admin
    .from("marketing_drafts")
    .select("version")
    .eq("organization_id", organizationId)
    .eq("property_id", propertyId)
    .eq("channel", channel)
    .eq("content_type", contentType)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version ?? 0) + 1;
}

/** Fișa de fapte a unei proprietăți: singura sursă pentru conținutul generat. */
export async function marketingContextFor(
  admin: Admin,
  actor: AiActor,
  propertyId: string,
) {
  const loaded = await loadMarketingProperty(admin, actor, propertyId);
  if (!loaded.ok) return loaded;
  const images = await imageCount(admin, actor, propertyId);
  const facts = buildMarketingFactSheet({ ...loaded.row, image_count: images });
  return {
    ok: true as const,
    row: loaded.row,
    facts,
    missing: missingMarketingData(facts),
    contextHash: marketingContextHash(facts),
  };
}

/** Brandul agenției, folosit doar pentru ton și semnătură. */
export async function marketingBrandingFor(admin: Admin, actor: AiActor) {
  const { data } = await admin
    .from("organizations")
    .select("name,city,material_website,material_phone,material_email,material_accent_color")
    .eq("id", actor.organizationId)
    .maybeSingle();
  if (!data) return null;
  return sanitizeCrmValue({
    agencyName: data.name,
    city: data.city,
    website: data.material_website,
    phone: data.material_phone,
    email: data.material_email,
  });
}

export type MarketingToolName =
  | "get_property_marketing_context"
  | "get_property_media_context"
  | "get_existing_listing_text"
  | "get_agency_branding_context"
  | "validate_marketing_facts"
  | "save_marketing_draft"
  | "apply_marketing_draft";

/**
 * Dispatcher-ul tool-urilor de marketing. Acțiunile (`save_marketing_draft`,
 * `apply_marketing_draft`) se execută numai cu `approvalGranted`.
 */
export async function runMarketingTool(
  actor: AiActor,
  name: string,
  args: Record<string, unknown>,
  capability: string,
  options: { approvalGranted: boolean },
): Promise<AiToolExecution> {
  const admin = await loadAdmin();
  const org = actor.organizationId;

  switch (name as MarketingToolName) {
    case "get_property_marketing_context": {
      const context = await marketingContextFor(admin, actor, String(args["propertyId"]));
      if (!context.ok) return { ok: false, error: context.error, code: context.code };
      return {
        ok: true,
        data: sanitizeCrmValue({
          facts: context.facts,
          missingData: context.missing,
          contextHash: context.contextHash,
        }),
        sources: [source(context.row)],
        summary: `Date de marketing pentru ${propertyLabel(context.row)}.`,
        capability,
      };
    }

    case "get_property_media_context": {
      const loaded = await loadMarketingProperty(admin, actor, String(args["propertyId"]));
      if (!loaded.ok) return { ok: false, error: loaded.error, code: loaded.code };
      const { data: images } = await admin
        .from("property_images")
        .select("id,alt,position,is_primary")
        .eq("organization_id", org)
        .eq("property_id", loaded.row.id)
        .eq("is_confidential", false)
        .eq("include_in_publish", true)
        .order("position", { ascending: true })
        .limit(20);
      const list = images ?? [];
      return {
        ok: true,
        data: sanitizeCrmValue({
          count: list.length,
          hasPrimary: list.some((image) => image.is_primary === true),
          altTexts: list.map((image) => image.alt).filter((alt) => typeof alt === "string"),
        }),
        sources: [source(loaded.row)],
        summary: `${list.length} imagini publicabile.`,
        capability,
      };
    }

    case "get_existing_listing_text": {
      const loaded = await loadMarketingProperty(admin, actor, String(args["propertyId"]));
      if (!loaded.ok) return { ok: false, error: loaded.error, code: loaded.code };
      const { data: drafts } = await admin
        .from("marketing_drafts")
        .select("id,version,channel,content_type,title,validation_status,created_at")
        .eq("organization_id", org)
        .eq("property_id", loaded.row.id)
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        ok: true,
        data: sanitizeCrmValue({
          title: loaded.row["title"] ?? null,
          description: loaded.row["description"] ?? null,
          recentDrafts: drafts ?? [],
        }),
        sources: [source(loaded.row)],
        summary: `Textul existent pentru ${propertyLabel(loaded.row)}.`,
        capability,
      };
    }

    case "get_agency_branding_context": {
      const branding = await marketingBrandingFor(admin, actor);
      if (!branding) return { ok: false, error: "Agenția nu a fost găsită.", code: "not_found" };
      return {
        ok: true,
        data: branding,
        sources: [],
        summary: "Datele de brand ale agenției.",
        capability,
      };
    }

    case "validate_marketing_facts": {
      const context = await marketingContextFor(admin, actor, String(args["propertyId"]));
      if (!context.ok) return { ok: false, error: context.error, code: context.code };
      const validation = validateMarketingFacts(String(args["text"] ?? ""), context.facts);
      return {
        ok: true,
        data: validation,
        sources: [source(context.row)],
        summary:
          validation.status === "valid"
            ? "Textul corespunde datelor proprietății."
            : `Verificare factuală: ${validation.issues.length} probleme.`,
        capability,
      };
    }

    case "save_marketing_draft": {
      if (!options.approvalGranted) {
        return { ok: false, error: "Salvarea ciornei necesită aprobarea utilizatorului.", code: "denied" };
      }
      const loaded = await loadMarketingProperty(admin, actor, String(args["propertyId"]));
      if (!loaded.ok) return { ok: false, error: loaded.error, code: loaded.code };

      // Versionare: nu suprascriem niciodată o ciornă existentă.
      const version = await nextDraftVersion(
        admin,
        org,
        String(loaded.row.id),
        String(args["channel"]),
        String(args["contentType"]),
      );

      const { data: inserted, error } = await admin
        .from("marketing_drafts")
        .insert({
          organization_id: org,
          property_id: loaded.row.id,
          version,
          channel: String(args["channel"]),
          content_type: String(args["contentType"]),
          tone: String(args["tone"]),
          length: String(args["length"]),
          source: "ai_generated",
          title: (args["title"] as string | null) ?? null,
          body: String(args["body"] ?? ""),
          short_variants: (args["shortVariants"] ?? []) as never,
          cta: (args["cta"] as string | null) ?? null,
          hashtags: (args["hashtags"] ?? []) as never,
          missing_data: (args["missingData"] ?? []) as never,
          validation_status: String(args["validationStatus"] ?? "valid"),
          validation_issues: (args["validationIssues"] ?? []) as never,
          context_version: String(args["contextVersion"] ?? "1"),
          context_hash: String(args["contextHash"] ?? ""),
          context_snapshot: (args["contextSnapshot"] ?? {}) as never,
          provider: (args["provider"] as string | null) ?? null,
          model: (args["model"] as string | null) ?? null,
          workflow_run_id: (args["runId"] as string | null) ?? null,
          created_by: actor.userId,
        })

        .select("id,version")
        .single();
      if (error || !inserted) {
        return { ok: false, error: "Ciorna nu a putut fi salvată.", code: "failed" };
      }
      return {
        ok: true,
        data: { id: inserted.id, version: inserted.version },
        sources: [source(loaded.row)],
        summary: `Ciornă salvată (versiunea ${inserted.version}) pentru ${propertyLabel(loaded.row)}.`,
        capability,
      };
    }

    case "apply_marketing_draft": {
      if (!options.approvalGranted) {
        return { ok: false, error: "Aplicarea textului necesită aprobarea utilizatorului.", code: "denied" };
      }
      const loaded = await loadMarketingProperty(admin, actor, String(args["propertyId"]));
      if (!loaded.ok) return { ok: false, error: loaded.error, code: loaded.code };
      const { data: draft } = await admin
        .from("marketing_drafts")
        .select("id,title,body,validation_status,property_id,channel,content_type,tone,length")
        .eq("id", String(args["draftId"]))
        .eq("organization_id", org)
        .maybeSingle();
      if (!draft || draft.property_id !== loaded.row.id) {
        return { ok: false, error: "Ciorna nu există în agenția ta.", code: "not_found" };
      }
      if (draft.validation_status === "invalid") {
        return {
          ok: false,
          error: "Ciorna nu a trecut verificarea factuală și nu poate fi aplicată.",
          code: "denied",
        };
      }
      // Se aplică exact textul aprobat: dacă ciorna salvată diferă de titlul și
      // corpul aprobate, nu scriem nimic.
      const approvedTitle = (args["title"] as string | null | undefined) ?? null;
      const approvedBody = args["body"] === undefined ? null : String(args["body"]);
      if (approvedBody !== null) {
        const sameBody = approvedBody === draft.body;
        const sameTitle = (approvedTitle ?? null) === (draft.title ?? null);
        if (!sameBody || !sameTitle) {
          return {
            ok: false,
            error:
              "Textul aprobat nu mai corespunde ciornei salvate, așa că nu l-am aplicat. Generează și aprobă textul din nou.",
            code: "denied",
          };
        }
      }

      // Textul anterior al proprietății devine o versiune în istoric, ca
      // revenirea la el să fie posibilă după aplicare.
      const previousTitle = (loaded.row["title"] as string | null) ?? null;
      const previousBody = (loaded.row["description"] as string | null) ?? null;
      let previousVersion: number | null = null;
      if (previousTitle !== null || previousBody !== null) {
        const snapshotVersion = await nextDraftVersion(
          admin,
          org,
          String(loaded.row.id),
          String(draft.channel),
          String(draft.content_type),
        );
        const { error: snapshotError } = await admin.from("marketing_drafts").insert({
          organization_id: org,
          property_id: loaded.row.id,
          version: snapshotVersion,
          channel: String(draft.channel),
          content_type: String(draft.content_type),
          tone: String(draft.tone),
          length: String(draft.length),
          source: "previous_property_text",
          title: previousTitle,
          body: previousBody ?? "",
          validation_status: "valid",
          context_version: "1",
          context_hash: "",
          created_by: actor.userId,
        });
        if (snapshotError) {
          console.error("[ai-marketing] snapshot insert failed", snapshotError.message);
          return {
            ok: false,
            error:
              "Nu am putut salva textul actual al proprietății ca versiune de rezervă, așa că nu am aplicat nimic.",
            code: "failed",
          };
        }
        previousVersion = snapshotVersion;
      }

      const { error } = await admin
        .from("properties")
        .update({
          description: draft.body,
          ...(draft.title ? { title: draft.title } : {}),
          updated_by: actor.userId,
        })
        .eq("id", loaded.row.id)
        .eq("organization_id", org);
      if (error) return { ok: false, error: "Textul nu a putut fi aplicat.", code: "failed" };
      await admin
        .from("marketing_drafts")
        .update({ applied_at: new Date().toISOString(), applied_by: actor.userId })
        .eq("id", draft.id)
        .eq("organization_id", org);

      return {
        ok: true,
        data: { id: draft.id, previousVersion },
        sources: [source(loaded.row)],
        summary:
          previousVersion === null
            ? `Textul a fost aplicat pe ${propertyLabel(loaded.row)}.`
            : `Textul a fost aplicat pe ${propertyLabel(loaded.row)}. Textul anterior este salvat ca versiunea ${previousVersion} în istoric.`,
        capability,
      };

    }

    default:
      return { ok: false, error: "Instrumentul cerut nu există.", code: "denied" };
  }
}
