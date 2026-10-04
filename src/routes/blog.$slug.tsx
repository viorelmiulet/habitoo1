import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BlogCard } from "@/components/blog/BlogCard";
import { BlogCover } from "@/components/blog/BlogCover";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Button } from "@/components/ui/button";
import { getPublishedBlogPost } from "@/lib/blog.functions";
import { SITE_NAME, SITE_URL } from "@/components/marketing/public-head";

const roDate = (value: string | null) => value ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "În curând";

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => { const data = await getPublishedBlogPost({ data: { slug: params.slug } }); if (!data) throw notFound(); return data; },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "Articol indisponibil — Habitoo" }, { name: "robots", content: "noindex" }] };
    const { post } = loaderData; const title = post.seo_title || `${post.title} — Habitoo`; const description = post.seo_description || post.excerpt; const url = `${SITE_URL}/blog/${post.slug}`;
    const meta: Record<string,string>[] = [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "article" }, { property: "og:url", content: url }, { property: "og:site_name", content: SITE_NAME }, { name: "twitter:card", content: "summary_large_image" }];
    if (post.published_at) meta.push({ property: "article:published_time", content: post.published_at });
    if (post.cover_image_url?.startsWith("https://")) meta.push({ property: "og:image", content: post.cover_image_url }, { name: "twitter:image", content: post.cover_image_url });
    return { meta, links: [{ rel: "canonical", href: url }], scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description, datePublished: post.published_at, dateModified: post.updated_at, author: { "@type": "Organization", name: post.author_name }, publisher: { "@type": "Organization", name: "Habitoo" }, mainEntityOfPage: url, ...(post.cover_image_url?.startsWith("https://") ? { image: post.cover_image_url } : {}) }) }] };
  },
  notFoundComponent: BlogNotFound,
  component: BlogArticlePage,
});
function BlogNotFound() { return <PublicLayout><main className="mx-auto max-w-3xl px-4 py-24 text-center"><h1 className="font-display text-4xl font-semibold text-navy">Articolul nu este disponibil</h1><p className="mt-4 text-muted-foreground">Poate este încă în lucru sau adresa nu mai este valabilă.</p><Button asChild variant="outline" className="mt-8 rounded-full"><Link to="/blog"><ArrowLeft/> Înapoi la blog</Link></Button></main></PublicLayout>; }
function BlogArticlePage() { const { post, similar } = Route.useLoaderData(); return <PublicLayout footerDescription="Sfaturi practice pentru agenții imobiliare, pregătite de echipa Habitoo."><article><header className="mk-hero-bg border-b border-border"><div className="mx-auto max-w-[760px] px-4 py-14 sm:px-6 sm:py-20"><Link to="/blog" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-gold-dark"><ArrowLeft className="size-4"/> Înapoi la blog</Link><span className="mt-7 block w-fit rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-accent-foreground">{post.category}</span><h1 className="mt-5 font-display text-4xl font-semibold leading-tight text-navy sm:text-5xl">{post.title}</h1><p className="mt-5 text-base text-muted-foreground">{roDate(post.published_at)} · {post.reading_minutes} min de citit · {post.author_name}</p></div></header><div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 sm:py-14"><BlogCover src={post.cover_image_url} alt={`Copertă pentru ${post.title}`} eager className="rounded-2xl"/><div className="blog-prose mt-10" dangerouslySetInnerHTML={{ __html: post.contentHtml ?? "" }}/><aside className="mt-14 rounded-2xl bg-navy p-7 text-navy-foreground sm:p-9"><h2 className="font-display text-2xl font-semibold">Gata să-ți organizezi agenția?</h2><p className="mt-2 text-sm text-navy-foreground/75">Păstrează proprietățile, clienții și activitățile într-un singur loc.</p><Button asChild className="mt-6 rounded-full"><Link to="/register">Creează agenția <ArrowRight/></Link></Button></aside></div></article>{similar.length ? <section className="border-t border-border bg-muted/40"><div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8"><h2 className="font-display text-3xl font-semibold text-navy">Mai poți citi</h2><div className="mt-7 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{similar.map((item) => <BlogCard key={item.id} post={item}/>)}</div></div></section> : null}</PublicLayout>; }
