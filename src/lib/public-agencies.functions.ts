// Citire publică (fără autentificare) a catalogului de agenții. Folosește doar
// funcțiile SQL `public_agencies_list` / `public_agency_by_slug`, care întorc
// exclusiv câmpuri publice; tabelele rămân închise pentru anonimi.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listPublicAgencies = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient().rpc("public_agencies_list");
  if (error) throw new Error("Catalogul nu a putut fi încărcat.");
  return data ?? [];
});

export const getPublicAgency = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ slug: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { data: row, error } = await publicClient().rpc("public_agency_by_slug", { _slug: data.slug });
    if (error) throw new Error("Agenția nu a putut fi încărcată.");
    return row ?? null;
  });
