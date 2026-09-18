/**
 * Citirea actului de identitate — un singur punct de intrare pe server.
 *
 * Regulă absolută: imaginea actului NU este niciodată păstrată — nici în bucket,
 * nici în tabel, nici în fișier temporar, nici în loguri. Există doar în memorie
 * pe durata cererii și este eliberată la final. Funcția nu scrie nimic în baza
 * de date.
 *
 * Etapa 1: se acceptă textul MRZ direct. Calea cu imagine întoarce
 * `needs_vision`, urmând să fie completată în etapa 2.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { emptyReading, readMrz, type IdDocumentReading } from "@/lib/contracts/id/read";

const inputSchema = z
  .object({
    mrz: z.string().trim().min(1).max(200).optional(),
    image: z
      .object({
        contentType: z.string().trim().max(100),
        base64: z.string().min(1),
      })
      .optional(),
  })
  .refine((data) => Boolean(data.mrz || data.image), {
    message: "Trimite textul MRZ sau imaginea actului.",
  });

export type IdDocumentReadResult =
  | { state: "needs_vision" }
  | { state: "invalid"; reason: string }
  | { state: "read"; reading: IdDocumentReading };

export const readIdDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<IdDocumentReadResult> => {
    /* Imaginea nu este citită, salvată sau înregistrată: doar semnalăm etapa 2. */
    if (!data.mrz) return { state: "needs_vision" };

    const reading = readMrz(data.mrz);
    if (reading.failures.includes("mrz_line_count") || reading.failures.includes("mrz_line_length")) {
      const blank = emptyReading(reading.failures[0] as string);
      return { state: "invalid", reason: blank.failures[0] as string };
    }
    return { state: "read", reading };
  });
