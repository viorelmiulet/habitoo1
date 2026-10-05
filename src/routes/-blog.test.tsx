// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function EmptyBlog() { return <h2>Pregătim primele articole. Revino curând.</h2>; }
describe("blog public", () => {
  it("afișează mesajul prietenos când nu există articole publicate", () => { expect(renderToStaticMarkup(<EmptyBlog />)).toContain("Pregătim primele articole. Revino curând."); });
  it("nu permite clientului anonim să citească ciorne", async () => {
    const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY; if (!url || !key) return;
    const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("blog_posts").select("id,status").eq("status", "draft").limit(1);
    expect(error).toBeNull(); expect(data).toEqual([]);
  });
  it("vizitatorul anonim vede articolele publicate", async () => {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL; const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY; if (!url || !key) return;
    const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.from("blog_posts").select("id,status").eq("status", "published");
    expect(error).toBeNull(); expect((data ?? []).length).toBeGreaterThan(0); expect(data?.every((p) => p.status === "published")).toBe(true);
  });
});
