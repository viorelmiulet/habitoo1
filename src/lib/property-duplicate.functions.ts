import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { TablesInsert } from "@/integrations/supabase/types";
import { requireActiveOrgAuth } from "@/lib/org-access";
import { buildDuplicatedProperty, duplicateStoragePath } from "@/lib/property-duplicate";

const MEDIA_BUCKET = "property-media";
const DOCS_BUCKET = "crm-documents";

export type DuplicatePropertyResult = {
  id: string;
  imagesCopied: number;
  documentsCopied: number;
};

export const duplicateProperty = createServerFn({ method: "POST" })
  .middleware([requireActiveOrgAuth])
  .inputValidator((data: unknown) => z.object({ propertyId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<DuplicatePropertyResult> => {
    const { supabase, userId } = context;
    const { data: source, error: sourceError } = await supabase
      .from("properties")
      .select("*")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) throw new Error("Proprietatea nu există sau nu îți este asignată.");

    const [{ data: images, error: imagesError }, { data: documents, error: documentsError }] =
      await Promise.all([
        supabase
          .from("property_images")
          .select("*")
          .eq("property_id", source.id)
          .order("position", { ascending: true }),
        supabase
          .from("documents")
          .select("*")
          .eq("entity_type", "property")
          .eq("entity_id", source.id)
          .order("created_at", { ascending: true }),
      ]);
    if (imagesError) throw new Error(imagesError.message);
    if (documentsError) throw new Error(documentsError.message);

    // Referința nouă vine din aceeași secvență globală ca la creare, deci nu
    // se poate repeta nici între agenții, nici la duplicări simultane.
    const { data: reference, error: referenceError } =
      await supabase.rpc("next_property_reference");
    if (referenceError) throw new Error(referenceError.message);

    const { data: created, error: createError } = await supabase
      .from("properties")
      .insert(
        buildDuplicatedProperty(source, {
          organizationId: source.organization_id,
          actorId: userId,
          reference,
        }),
      )
      .select("id")
      .single();
    if (createError) throw new Error(createError.message);

    const copiedFiles: Array<{ bucket: string; path: string }> = [];
    try {
      const imageRows: TablesInsert<"property_images">[] = [];
      for (const image of images ?? []) {
        if (!image.storage_path) {
          throw new Error("O fotografie veche nu are fișierul sursă asociat.");
        }
        const destination = duplicateStoragePath(
          source.organization_id,
          created.id,
          image.storage_path,
          `image-${image.position}.jpg`,
        );
        const { error } = await supabase.storage
          .from(MEDIA_BUCKET)
          .copy(image.storage_path, destination);
        if (error)
          throw new Error(
            `Fotografia ${image.position + 1} nu a putut fi copiată: ${error.message}`,
          );
        copiedFiles.push({ bucket: MEDIA_BUCKET, path: destination });
        imageRows.push({
          organization_id: source.organization_id,
          property_id: created.id,
          url: destination,
          storage_path: destination,
          position: image.position,
          is_primary: image.is_primary,
          is_confidential: image.is_confidential,
          include_in_publish: image.include_in_publish,
          alt: image.alt,
          width: image.width,
          height: image.height,
          created_by: userId,
        });
      }
      if (imageRows.length > 0) {
        const { error } = await supabase.from("property_images").insert(imageRows);
        if (error) throw new Error(`Fotografiile copiate nu au putut fi atașate: ${error.message}`);
      }

      const documentRows: TablesInsert<"documents">[] = [];
      for (const document of documents ?? []) {
        const destination = duplicateStoragePath(
          source.organization_id,
          created.id,
          document.storage_path,
          document.name,
        );
        const { error } = await supabase.storage
          .from(DOCS_BUCKET)
          .copy(document.storage_path, destination);
        if (error)
          throw new Error(`Documentul „${document.name}” nu a putut fi copiat: ${error.message}`);
        copiedFiles.push({ bucket: DOCS_BUCKET, path: destination });
        documentRows.push({
          organization_id: source.organization_id,
          entity_type: "property",
          entity_id: created.id,
          name: document.name,
          storage_path: destination,
          mime_type: document.mime_type,
          size_bytes: document.size_bytes,
          created_by: userId,
        });
      }
      if (documentRows.length > 0) {
        const { error } = await supabase.from("documents").insert(documentRows);
        if (error) throw new Error(`Documentele copiate nu au putut fi atașate: ${error.message}`);
      }

      const { error: auditError } = await supabase.from("audit_logs").insert({
        organization_id: source.organization_id,
        actor_id: userId,
        action: "property_duplicated",
        entity: "property",
        entity_id: source.id,
        new_values: {
          newId: created.id,
          imagesCopied: imageRows.length,
          documentsCopied: documentRows.length,
        },
        created_by: userId,
      });
      if (auditError) console.error("[property-duplicate] audit failed", auditError.message);

      return {
        id: created.id,
        imagesCopied: imageRows.length,
        documentsCopied: documentRows.length,
      };
    } catch (error) {
      for (const bucket of [MEDIA_BUCKET, DOCS_BUCKET]) {
        const paths = copiedFiles.filter((file) => file.bucket === bucket).map((file) => file.path);
        if (paths.length > 0) await supabase.storage.from(bucket).remove(paths);
      }
      await supabase.from("properties").delete().eq("id", created.id);
      throw error;
    }
  });
