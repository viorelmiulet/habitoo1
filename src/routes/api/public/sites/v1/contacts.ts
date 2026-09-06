// POST /api/public/sites/v1/contacts — lead venit din site-ul conectat.
// Creează/reutilizează contactul și creează un lead în pipeline, cu source website/API.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withFeedAuth, jsonResponse, errorResponse, FEED_API_VERSION } from "@/lib/site-feed/auth.server";
import { requireFeedScope } from "@/lib/site-feed/handlers.server";

const schema = z.object({
  nume: z.string().trim().min(2).max(120),
  telefon: z.string().trim().min(6).max(32).optional(),
  email: z.string().trim().email().max(255).optional(),
  mesaj: z.string().trim().max(2000).optional(),
  id: z.string().uuid().optional(),
  source: z.string().trim().max(60).optional(),
});

export const Route = createFileRoute("/api/public/sites/v1/contacts")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withFeedAuth(request, "contacts", async (auth) => {
          const denied = requireFeedScope(auth, "leads:write");
          if (denied) return denied;
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return { response: errorResponse(400, "Invalid JSON body."), items: 0 };
          }
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return { response: errorResponse(422, "Invalid payload."), items: 0 };
          }
          const input = parsed.data;
          if (!input.telefon && !input.email) {
            return { response: errorResponse(422, "Either telefon or email is required."), items: 0 };
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Proprietatea trebuie să aparțină agenției din token (tenant isolation).
          let propertyId: string | null = null;
          if (input.id) {
            const { data: property } = await supabaseAdmin
              .from("properties")
              .select("id, assigned_to")
              .eq("organization_id", auth.organizationId)
              .eq("id", input.id)
              .maybeSingle();
            if (!property) {
              return { response: errorResponse(404, "Property not found."), items: 0 };
            }
            propertyId = property.id;
          }

          const source = input.source ? `website:${input.source}` : "website";
          const [firstName, ...restName] = input.nume.split(/\s+/);
          const lastName = restName.join(" ");

          // Deduplicare contact: telefon sau email, în cadrul agenției.
          let contactId: string | null = null;
          const dedupe = supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("organization_id", auth.organizationId)
            .limit(1);
          const existing = input.email
            ? await dedupe.eq("email", input.email)
            : await dedupe.eq("phone", input.telefon!);
          if (existing.data?.[0]) {
            contactId = existing.data[0].id;
          } else {
            const { data: created, error: createError } = await supabaseAdmin
              .from("contacts")
              .insert({
                organization_id: auth.organizationId,
                type: "buyer",
                first_name: firstName ?? input.nume,
                last_name: lastName || "-",
                phone: input.telefon ?? null,
                email: input.email ?? null,
                source,
                notes: input.mesaj ?? null,
                status: "new",
              })
              .select("id")
              .single();
            if (createError) throw createError;
            contactId = created.id;
          }

          // Deduplicare lead: același contact + exact aceeași proprietate (sau
          // ambele fără proprietate), încă deschis. Un lead nu este niciodată
          // reutilizat pentru o altă proprietate.
          const openLeadQuery = supabaseAdmin
            .from("leads")
            .select("id, notes")
            .eq("organization_id", auth.organizationId)
            .eq("contact_id", contactId)
            .not("stage", "in", "(won,lost)")
            .limit(1);
          const openLead = await (propertyId
            ? openLeadQuery.eq("property_id", propertyId)
            : openLeadQuery.is("property_id", null)
          ).maybeSingle();

          let leadId: string;
          let deduplicated = false;
          if (openLead.data) {
            leadId = openLead.data.id;
            deduplicated = true;
            // Nu suprascriem datele CRM: doar marcăm interacțiunea și adăugăm mesajul nou.
            const notes = input.mesaj
              ? [openLead.data.notes, input.mesaj].filter(Boolean).join("\n---\n").slice(0, 8000)
              : openLead.data.notes;
            await supabaseAdmin
              .from("leads")
              .update({ last_interaction_at: new Date().toISOString(), notes })
              .eq("organization_id", auth.organizationId)
              .eq("id", leadId);
          } else {
            const { data: lead, error: leadError } = await supabaseAdmin
              .from("leads")
              .insert({
                organization_id: auth.organizationId,
                contact_id: contactId,
                property_id: propertyId,
                name: input.nume,
                phone: input.telefon ?? null,
                email: input.email ?? null,
                source,
                stage: "new",
                notes: input.mesaj ?? null,
                last_interaction_at: new Date().toISOString(),
              })
              .select("id")
              .single();
            if (leadError) throw leadError;
            leadId = lead.id;
            await supabaseAdmin.from("lead_events").insert({
              organization_id: auth.organizationId,
              lead_id: leadId,
              to_stage: "new",
              note: `Lead primit din site (${source}).`,
            });
          }


          await supabaseAdmin.from("audit_logs").insert({
            organization_id: auth.organizationId,
            action: "site_feed.contact_received",
            entity: "leads",
            entity_id: leadId,
            new_values: { source, property_id: propertyId, deduplicated },
          });

          return {
            response: jsonResponse(
              { data: { lead_id: leadId, contact_id: contactId, deduplicated }, api_version: FEED_API_VERSION },
              201,
            ),
            items: 1,
          };
        }),
    },
  },
});
