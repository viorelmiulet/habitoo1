import type { BlogFaq, BlogPost } from "@/lib/blog";
import { FEATURE_PAGES } from "./feature-pages";

export const BLOG_SITE = "https://www.habitoo.ro";
export const BLOG_ORG_ID = `${BLOG_SITE}/#organization`;
export const BLOG_AUTHOR = { "@type": "Organization", name: "Echipa Habitoo", url: `${BLOG_SITE}/despre`, parentOrganization: { "@id": BLOG_ORG_ID } } as const;
export const BLOG_AUTHOR_NAME = "Echipa Habitoo";

type Toc = { id: string; text: string }[];
const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const slug = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "sectiune";

/** Adds stable ids to every H2; the table of contents exists only for at least 3 H2. */
export function withHeadingAnchors(html: string): { html: string; toc: Toc } {
  const used = new Map<string, number>(); const all: Toc = [];
  const out = html.replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (_m, _attrs, inner: string) => {
    const text = strip(inner); const base = slug(text); const n = used.get(base) ?? 0; used.set(base, n + 1);
    const id = n ? `${base}-${n + 1}` : base; all.push({ id, text });
    return `<h2 id="${id}">${inner}</h2>`;
  });
  return { html: out, toc: all.length >= 3 ? all : [] };
}

export function blogAnswer(excerpt: string | null | undefined, html: string): string {
  const source = excerpt?.trim() || strip(html.match(/<p>([\s\S]*?)<\/p>/)?.[1] ?? "");
  const sentences = source.match(/[^.!?]+[.!?]+/g) ?? [source];
  return sentences.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
}

export function wordCount(html: string): number { return strip(html).split(" ").filter(Boolean).length; }

export function normalizeFaq(value: unknown): BlogFaq[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const q = typeof item?.q === "string" ? item.q.trim() : ""; const a = typeof item?.a === "string" ? item.a.trim() : "";
    return q && a ? [{ q, a }] : [];
  });
}

const STOP = new Set(["pentru", "care", "este", "sunt", "unei", "unui", "acest", "aceasta", "cum", "ce", "din", "sau", "mai", "fara", "prin", "lor", "tale", "tau"]);
const words = (text: string) => new Set(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w)));

/** Three related posts by shared title words, then same category, then recency. */
export function relatedPosts<T extends Pick<BlogPost, "id" | "title" | "category">>(post: T, candidates: T[], limit = 3): T[] {
  const own = words(post.title);
  return candidates.filter((c) => c.id !== post.id).map((c, index) => ({ c, index, score: [...words(c.title)].filter((w) => own.has(w)).length * 2 + (c.category === post.category ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map((x) => x.c);
}

/** A feature only when its name clearly appears in the title or category. */
export function relatedFeature(post: Pick<BlogPost, "title" | "category">): { slug: string; name: string } | null {
  const hay = ` ${[...words(`${post.title} ${post.category}`)].join(" ")} `;
  for (const page of FEATURE_PAGES) {
    const key = [...words(page.name)];
    if (key.length && key.every((w) => hay.includes(` ${w}`))) return { slug: page.slug, name: page.name };
  }
  return null;
}

export function blogPostingJsonLd(post: Pick<BlogPost, "slug" | "title" | "published_at" | "updated_at">, opts: { description: string; image?: string | null; words: number }) {
  const url = `${BLOG_SITE}/blog/${post.slug}`;
  return { "@type": "BlogPosting", "@id": `${url}#article`, headline: post.title, description: opts.description, ...(opts.image ? { image: opts.image } : {}), datePublished: post.published_at, dateModified: post.updated_at, author: BLOG_AUTHOR, publisher: { "@type": "Organization", "@id": BLOG_ORG_ID, name: "Habitoo", logo: { "@type": "ImageObject", url: `${BLOG_SITE}/assets/habitoo-logo.png` } }, mainEntityOfPage: { "@type": "WebPage", "@id": url }, inLanguage: "ro", wordCount: opts.words };
}

export function blogBreadcrumbJsonLd(post: Pick<BlogPost, "slug" | "title">) {
  const url = `${BLOG_SITE}/blog/${post.slug}`;
  return { "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`, itemListElement: [{ "@type": "ListItem", position: 1, name: "Acasă", item: `${BLOG_SITE}/` }, { "@type": "ListItem", position: 2, name: "Blog", item: `${BLOG_SITE}/blog` }, { "@type": "ListItem", position: 3, name: post.title, item: url }] };
}

export function blogFaqJsonLd(slugValue: string, faq: BlogFaq[]) {
  if (!faq.length) return null;
  return { "@type": "FAQPage", "@id": `${BLOG_SITE}/blog/${slugValue}#faq`, mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
}
