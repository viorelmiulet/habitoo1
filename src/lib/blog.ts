export type BlogStatus = "draft" | "published";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  contentHtml?: string;
  cover_image_url: string | null;
  category: string;
  author_name: string;
  status: BlogStatus;
  published_at: string | null;
  reading_minutes: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
};

export type BlogPostInput = Omit<BlogPost, "id" | "contentHtml" | "created_at" | "updated_at" | "reading_minutes"> & { id?: string };

export function slugifyBlogTitle(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function calculateReadingMinutes(content: string) {
  const words = content.replace(/<[^>]*>/g, " ").replace(/[#*_>`\[\]()!-]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function blogCoverUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("/api/public/blog-media/") || value.startsWith("/assets/") || /^https?:\/\//.test(value)) return value;
  return `/api/public/blog-media/${value.replace(/^\/+/, "")}`;
}
