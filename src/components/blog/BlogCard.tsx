import { Link } from "@tanstack/react-router";
import type { BlogPost } from "@/lib/blog";
import { BlogCover } from "./BlogCover";

const roDate = (value: string | null) => value ? new Intl.DateTimeFormat("ro-RO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value)) : "În curând";

export function BlogCard({ post }: { post: BlogPost }) {
  return <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
    <Link to="/blog/$slug" params={{ slug: post.slug }} aria-label={`Citește ${post.title}`}><BlogCover src={post.cover_image_url} alt={`Copertă pentru ${post.title}`} /></Link>
    <div className="p-5 sm:p-6">
      <span className="inline-flex rounded-full bg-gold-tint px-3 py-1 text-xs font-semibold text-accent-foreground">{post.category}</span>
      <p className="mt-4 text-xs text-muted-foreground">{roDate(post.published_at)} · {post.reading_minutes} min de citit</p>
      <h2 className="mt-2 font-display text-xl font-semibold leading-tight text-navy"><Link to="/blog/$slug" params={{ slug: post.slug }} className="hover:text-gold-dark">{post.title}</Link></h2>
      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
    </div>
  </article>;
}
