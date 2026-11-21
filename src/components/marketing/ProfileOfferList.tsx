import { Link } from "@tanstack/react-router";
import type { ProfileOffers } from "@/lib/public-profiles.server";

const fmt = (n: number, c: string) => `${new Intl.NumberFormat("ro-RO").format(n)} ${c}`;

/** Server-paginated list of eligible offers for an agency or agent profile. */
export function ProfileOfferList({ offers, pageHref }: { offers: ProfileOffers; pageHref: (page: number) => string }) {
  if (!offers.items.length) return <p className="text-muted-foreground">Nicio ofertă publicată momentan.</p>;
  return (
    <div className="space-y-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {offers.items.map((o) => (
          <li key={o.slug} className="overflow-hidden rounded-[22px] border border-border bg-card shadow-soft">
            <Link to="/oferta/$id" params={{ id: o.slug }} className="block">
              <div className="aspect-[4/3] w-full bg-muted">
                {o.imageId ? <img src={`/api/public/sites/v1/media/${o.imageId}`} alt={o.title} loading="lazy" className="size-full object-cover" /> : null}
              </div>
              <div className="space-y-1 p-4">
                <p className="line-clamp-2 text-sm font-semibold text-navy">{o.title}</p>
                <p className="text-xs text-muted-foreground">
                  {[o.district, o.city].filter(Boolean).join(", ")}
                  {o.rooms ? ` · ${o.rooms} ${o.rooms === 1 ? "cameră" : "camere"}` : ""}
                  {o.surface ? ` · ${o.surface} m²` : ""}
                </p>
                {o.price ? <p className="text-sm font-semibold text-navy">{fmt(o.price, o.currency)}{o.transactionKind === "rent" ? " / lună" : ""}</p> : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {offers.pages > 1 ? (
        <nav aria-label="Paginare oferte" className="flex items-center gap-4 text-sm">
          {offers.page > 1 ? <a href={pageHref(offers.page - 1)} rel="prev" className="font-semibold underline">Anterioara</a> : null}
          <span className="text-muted-foreground">Pagina {offers.page} din {offers.pages}</span>
          {offers.page < offers.pages ? <a href={pageHref(offers.page + 1)} rel="next" className="font-semibold underline">Următoarea</a> : null}
        </nav>
      ) : null}
    </div>
  );
}
