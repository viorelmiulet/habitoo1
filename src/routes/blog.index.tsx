import { PublicPhotoHeading } from "@/components/marketing/PublicPhotoHeading";
import { publicPagePhotos, publicPhotoHead } from "@/components/marketing/public-page-photos";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BlogCard } from "@/components/blog/BlogCard";
import { BlogCover } from "@/components/blog/BlogCover";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Button } from "@/components/ui/button";
import { listPublishedBlogPosts } from "@/lib/blog.functions";
import { publicHead, SITE_URL } from "@/components/marketing/public-head";

import { ORG_ID, WEBSITE_ID } from "@/components/marketing/structured-data";

const TITLE = "Blog Habitoo — sfaturi practice pentru agenții imobiliare";
const DESCRIPTION = "Sfaturi practice pentru agenții imobiliare: organizare, vânzări, negociere, carieră și dezvoltarea agenției.";
const roDate = (value: string | null) => value ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "În curând";

export const Route = createFileRoute("/blog/")({
  loader: () => listPublishedBlogPosts(),
  head: ({ loaderData }) => publicHead({ ...publicPhotoHead(publicPagePhotos.blog), path: "/blog", title: TITLE, description: DESCRIPTION, jsonLd: { "@context": "https://schema.org", "@type": "Blog", "@id": `${SITE_URL}/blog#blog`, isPartOf: { "@id": WEBSITE_ID }, name: "Blog Habitoo", description: DESCRIPTION, url: `${SITE_URL}/blog`, publisher: { "@id": ORG_ID }, blogPost: (loaderData ?? []).map((post) => ({ "@type": "BlogPosting", author: { "@id": ORG_ID }, publisher: { "@id": ORG_ID }, headline: post.title, url: `${SITE_URL}/blog/${post.slug}`, datePublished: post.published_at, dateModified: post.updated_at })) } }),
  component: BlogPage,
});

function BlogPage() {
  const posts = Route.useLoaderData();
  const [category, setCategory] = useState("Toate");
  const [visible, setVisible] = useState(9);
  const categories = useMemo(() => ["Toate", ...new Set(posts.map((post) => post.category))], [posts]);
  const filtered = category === "Toate" ? posts : posts.filter((post) => post.category === category);
  const featured = filtered[0];
  const rest = filtered.slice(1, visible + 1);
  return <PublicLayout homeHeader footerDescription="Sfaturi practice pentru agenții imobiliare, pregătite de echipa Habitoo.">
    <section className="mk-hero-bg border-b border-border"><div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8"><PublicPhotoHeading photo={publicPagePhotos.blog}><div><p className="text-sm font-semibold text-gold-dark">Idei pentru o agenție mai bine organizată</p><h1 className="mt-3 font-display text-4xl font-semibold text-navy sm:text-5xl">Blog Habitoo</h1><p className="mt-4 text-lg text-muted-foreground">Sfaturi practice pentru agenții imobiliare.</p></div></PublicPhotoHeading></div></section>
    <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      {posts.length === 0 ? <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center"><h2 className="font-display text-2xl font-semibold text-navy">Pregătim primele articole. Revino curând.</h2><p className="mt-2 text-muted-foreground">Lucrăm la idei practice pentru munca de zi cu zi din agenție.</p></div> : <>
        <div className="mb-10 flex gap-2 overflow-x-auto pb-2" aria-label="Filtrează după categorie">{categories.map((item) => <Button key={item} type="button" variant={category === item ? "default" : "outline"} className="h-11 shrink-0 rounded-full" onClick={() => { setCategory(item); setVisible(9); }}>{item}</Button>)}</div>
        {featured ? <article className="grid overflow-hidden rounded-3xl border border-border bg-card shadow-soft lg:grid-cols-2"><BlogCover src={featured.cover_image_url} alt={`Copertă pentru ${featured.title}`} eager className="h-full min-h-64"/><div className="flex flex-col justify-center p-6 sm:p-10"><span className="w-fit rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-accent-foreground">{featured.category}</span><p className="mt-4 text-sm text-muted-foreground">{roDate(featured.published_at)} · {featured.reading_minutes} min de citit</p><h2 className="mt-3 font-display text-3xl font-semibold text-navy sm:text-4xl">{featured.title}</h2><p className="mt-4 leading-relaxed text-muted-foreground">{featured.excerpt}</p><Button asChild className="mt-7 w-fit rounded-full"><Link to="/blog/$slug" params={{ slug: featured.slug }}>Citește articolul <ArrowRight /></Link></Button></div></article> : null}
        {rest.length ? <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{rest.map((post) => <BlogCard key={post.id} post={post}/>)}</div> : null}
        {filtered.length > visible + 1 ? <div className="mt-10 text-center"><Button type="button" variant="outline" className="h-11 rounded-full" onClick={() => setVisible((count) => count + 9)}>Încarcă mai multe</Button></div> : null}
      </>}
    </section>
  </PublicLayout>;
}
