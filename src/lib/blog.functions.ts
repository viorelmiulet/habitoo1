import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { blogCoverUrl, calculateReadingMinutes, type BlogPost } from "@/lib/blog";

const rowFields = "id,slug,title,excerpt,content,cover_image_url,category,author_name,status,published_at,reading_minutes,seo_title,seo_description,created_at,updated_at";

function publicClient() {
  return createClient<Database>(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } });
}

function mapPost(row: Record<string, unknown>): BlogPost {
  return { ...(row as unknown as BlogPost), cover_image_url: blogCoverUrl((row.cover_image_url as string | null) ?? null) };
}

export const listPublishedBlogPosts = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicClient();
  const { data, error } = await db.from("blog_posts").select(rowFields).eq("status", "published").lte("published_at", new Date().toISOString()).order("published_at", { ascending: false });
  if (error) throw new Error("Articolele nu au putut fi încărcate.");
  return (data ?? []).map((row) => mapPost(row as Record<string, unknown>));
});

export const getPublishedBlogPost = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ slug: z.string().min(1).max(180) }).parse(data))
  .handler(async ({ data }) => {
    const db = publicClient();
    const { data: row, error } = await db.from("blog_posts").select(rowFields).eq("slug", data.slug).eq("status", "published").lte("published_at", new Date().toISOString()).maybeSingle();
    if (error || !row) return null;
    const { renderSafeBlogContent } = await import("@/lib/blog-content.server");
    const post = mapPost(row as Record<string, unknown>);
    const { data: similar } = await db.from("blog_posts").select(rowFields).eq("status", "published").lte("published_at", new Date().toISOString()).neq("id", post.id).order("published_at", { ascending: false }).limit(12);
    const candidates = (similar ?? []).map((item) => mapPost(item as Record<string, unknown>));
    const sameCategory = candidates.filter((item) => item.category === post.category);
    return { post: { ...post, contentHtml: renderSafeBlogContent(post.content) }, similar: [...sameCategory, ...candidates.filter((item) => item.category !== post.category)].slice(0, 3) };
  });

type AuthContext = { supabase: { rpc: (fn: "is_superadmin") => PromiseLike<{ data: boolean | null; error: { message: string } | null }> }; userId: string };
async function assertSuperadmin(context: AuthContext) { const { data, error } = await context.supabase.rpc("is_superadmin"); if (error || data !== true) throw new Error("Acces refuzat."); return context.userId; }

export const listAdminBlogPosts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertSuperadmin(context as AuthContext);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("blog_posts").select(rowFields).order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPost(row as Record<string, unknown>));
});

export const getAdminBlogPost = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertSuperadmin(context as AuthContext);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("blog_posts").select(rowFields).eq("id", data.id).maybeSingle();
    if (error || !row) return null;
    const { renderSafeBlogContent } = await import("@/lib/blog-content.server");
    const post = mapPost(row as Record<string, unknown>);
    return { ...post, contentHtml: renderSafeBlogContent(post.content) };
  });

const postInput = z.object({ id: z.string().uuid().optional(), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalid.").max(180), title: z.string().trim().min(3).max(180), excerpt: z.string().trim().min(10).max(500), content: z.string().trim().min(50), cover_image_url: z.string().trim().max(1000).nullable(), category: z.string().trim().min(2).max(80), author_name: z.string().trim().min(2).max(100), status: z.enum(["draft", "published"]), published_at: z.string().datetime().nullable(), seo_title: z.string().trim().max(180).nullable(), seo_description: z.string().trim().max(320).nullable() });

export const saveBlogPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => postInput.parse(data)).handler(async ({ data, context }) => {
  await assertSuperadmin(context as AuthContext);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const payload = { ...data, id: undefined, published_at: data.status === "published" ? (data.published_at ?? new Date().toISOString()) : data.published_at, reading_minutes: calculateReadingMinutes(data.content) };
  const existing = await supabaseAdmin.from("blog_posts").select("id").eq("slug", data.slug).neq("id", data.id ?? "00000000-0000-0000-0000-000000000000").maybeSingle();
  if (existing.data) throw new Error("Slug-ul este deja folosit de alt articol.");
  const query = data.id ? supabaseAdmin.from("blog_posts").update(payload).eq("id", data.id) : supabaseAdmin.from("blog_posts").insert(payload);
  const { data: row, error } = await query.select(rowFields).single();
  if (error) throw new Error(error.message);
  return mapPost(row as Record<string, unknown>);
});

export const deleteBlogPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data)).handler(async ({ data, context }) => {
  await assertSuperadmin(context as AuthContext);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("blog_posts").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
});

export const uploadBlogImage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((data) => z.object({ name: z.string().max(180), contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]), base64: z.string().max(11_000_000) }).parse(data)).handler(async ({ data, context }) => {
  await assertSuperadmin(context as AuthContext);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" }[data.contentType];
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage.from("blog-media").upload(path, Buffer.from(data.base64, "base64"), { contentType: data.contentType, upsert: false });
  if (error) throw new Error(error.message);
  return { path, url: blogCoverUrl(path) };
});
