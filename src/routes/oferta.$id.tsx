import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PublicLayout } from "@/components/marketing/PublicLayout";
import { Container, Section } from "@/components/marketing/Section";
import { publicHead } from "@/components/marketing/public-head";
import { getPublicOffer } from "@/lib/public-offer.functions";
import { mediaOriginForHost } from "@/lib/site-feed/config";
import { feedImageUrl } from "@/lib/site-feed/mapper";
import { getCurrentHostname } from "@/lib/current-host";
import { formatMoney } from "@/lib/format";
import { contactLines, safeAccent } from "@/lib/materials";

export const Route = createFileRoute("/oferta/$id")({
  loader: async ({ params }) => {
    const offer = await getPublicOffer({ data: { id: params.id } });
    if (!offer) throw notFound();
    return { offer };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Ofertă indisponibilă — Habitoo" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { offer } = loaderData;
    const title = `${offer.title} — ${offer.city ?? "România"} | Habitoo`;
    const description =
      offer.description?.slice(0, 155) ??
      `${offer.title} în ${offer.city ?? "România"}. Detalii, fotografii și contact prin agenția care administrează oferta.`;
    return publicHead({ path: `/oferta/${offer.id}`, title, description });
  },
  notFoundComponent: OfferNotFound,
  errorComponent: OfferNotFound,
  component: OfferPage,
});

function OfferNotFound() {
  return (
    <PublicLayout>
      <Section>
        <Container>
          <h1 className="text-2xl font-semibold">Oferta nu mai este disponibilă</h1>
          <p className="mt-2 text-muted-foreground">
            Este posibil ca anunțul să fi fost retras sau vândut.
          </p>
          <Link to="/" className="mt-4 inline-block text-primary underline">
            Înapoi la pagina principală
          </Link>
        </Container>
      </Section>
    </PublicLayout>
  );
}

function OfferPage() {
  const { offer } = Route.useLoaderData();
  const origin = mediaOriginForHost(getCurrentHostname());

  const specs: [string, string][] = [
    ["Tip", offer.propertyType],
    ["Tranzacție", offer.transactionKind === "rent" ? "Închiriere" : "Vânzare"],
    offer.rooms ? ["Camere", String(offer.rooms)] : null,
    offer.bathrooms ? ["Băi", String(offer.bathrooms)] : null,
    offer.surface ? ["Suprafață", `${offer.surface} m²`] : null,
    offer.usableSurface ? ["Suprafață utilă", `${offer.usableSurface} m²`] : null,
    offer.landSurface ? ["Teren", `${offer.landSurface} m²`] : null,
    offer.floor !== null ? ["Etaj", String(offer.floor)] : null,
    offer.buildYear ? ["An construcție", String(offer.buildYear)] : null,
  ].filter((v): v is [string, string] => Array.isArray(v));

  const branding = offer.branding;
  const accent = safeAccent(branding.accent);
  const contacts = contactLines(branding);

  return (
    <PublicLayout>
      <Section>
        <Container className="space-y-8">
          {/* Identitatea agenției care trimite oferta, nu a platformei. */}
          <div
            className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] pb-4"
            style={{ borderBottomColor: accent }}
          >
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt={branding.agencyName}
                className="max-h-14 w-auto max-w-52 object-contain"
              />
            ) : (
              <span className="text-xl font-semibold tracking-tight">{branding.agencyName}</span>
            )}
            <span className="text-sm text-muted-foreground">{branding.agencyName}</span>
          </div>

          <header className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {[offer.district, offer.city, offer.county].filter(Boolean).join(", ")}
              {offer.reference ? ` · Ref. ${offer.reference}` : ""}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{offer.title}</h1>
            <p className="text-2xl font-semibold" style={{ color: accent }}>
              {offer.price ? formatMoney(offer.price, offer.currency) : "Preț la cerere"}
            </p>
          </header>

          {offer.images.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {offer.images.slice(0, 6).map((img, index) => (
                <img
                  key={img.id}
                  src={feedImageUrl(origin, img.id)}
                  alt={img.alt ?? offer.title}
                  loading={index === 0 ? "eager" : "lazy"}
                  className="aspect-[4/3] w-full rounded-xl object-cover"
                />
              ))}
            </div>
          ) : null}

          <dl className="grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-3">
            {specs.map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          {offer.description ? (
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Descriere</h2>
              <p className="whitespace-pre-line text-muted-foreground">{offer.description}</p>
            </div>
          ) : null}

          {offer.features.length || offer.utilities.length ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {offer.features.length ? (
                <div>
                  <h2 className="mb-2 text-lg font-semibold">Dotări</h2>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {offer.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {offer.utilities.length ? (
                <div>
                  <h2 className="mb-2 text-lg font-semibold">Utilități</h2>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {offer.utilities.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <footer className="space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{branding.agencyName}</p>
            {contacts.length ? <p>{contacts.join(" · ")}</p> : null}
            {branding.showHabitoo ? (
              <p className="text-xs">Material generat cu Habitoo CRM</p>
            ) : null}
          </footer>
        </Container>
      </Section>
    </PublicLayout>
  );
}
