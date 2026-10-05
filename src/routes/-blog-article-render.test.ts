import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Rulează pe un server pornit: BLOG_TEST_BASE_URL (implicit http://localhost:8080).
const BASE = process.env.BLOG_TEST_BASE_URL ?? "http://localhost:8080";
const decode = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim();
const h1s = (html: string) => [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => decode(m[1]));
const reachable = async () => { try { return (await fetch(`${BASE}/blog`)).ok; } catch { return false; } };

describe("rutele blogului", () => {
  it("lista nu mai este rută-părinte pentru articol", () => {
    expect(existsSync("src/routes/blog.tsx")).toBe(false);
    expect(readFileSync("src/routes/blog.index.tsx", "utf8")).toContain('createFileRoute("/blog/")');
  });

  it("/blog afișează lista, iar /blog/<slug> afișează articolul cu h1 propriu și conținut", async () => {
    const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key || !(await reachable())) return;
    const db = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data } = await db.from("blog_posts").select("slug,title,content").eq("status", "published").lte("published_at", new Date().toISOString());
    const list = await (await fetch(`${BASE}/blog`)).text();
    expect(h1s(list)).toEqual(["Blog Habitoo"]);
    for (const post of data ?? []) {
      const res = await fetch(`${BASE}/blog/${post.slug}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(h1s(html)).toEqual([post.title]);
      const fragment = post.content.split("\n").map((l) => l.trim()).find((l) => l.length > 60 && !/[#*_[\]`<>&]/.test(l))!.slice(0, 40);
      expect(html).toContain(fragment);
    }
    expect((await fetch(`${BASE}/blog/slug-inexistent-test`)).status).toBe(404);
  });
});
