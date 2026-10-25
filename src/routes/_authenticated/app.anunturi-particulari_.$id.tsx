import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  MessageSquare,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  addListingComment,
  getListingComments,
  getOwnerListing,
  LISTING_COMMENT_MAX_LENGTH,
  type OwnerListing,
} from "@/lib/listings.functions";

export const Route = createFileRoute("/_authenticated/app/anunturi-particulari_/$id")({
  head: () => appHead("Anunț particular — Habitoo CRM"),
  component: OwnerListingDetailPage,
});

const SOURCE_LABELS: Record<string, string> = {
  storia: "Storia",
  imobiliare: "Imobiliare.ro",
  olx: "OLX",
  romimo: "Romimo",
  imoradar: "Imoradar24",
};

function money(value: number | null, currency: string | null) {
  if (value === null) return null;
  try {
    return new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value} ${currency ?? ""}`;
  }
}

function transactionLabel(value: string | null) {
  if (!value) return null;
  if (/pe zi/i.test(value)) return "Închiriere pe zi";
  if (/rent|inch/i.test(value)) return "Închiriere";
  return "Vânzare";
}

function OwnerListingDetailPage() {
  const { id } = Route.useParams();
  const fetchListing = useServerFn(getOwnerListing);
  const listing = useQuery({
    queryKey: ["owner-listing", id],
    queryFn: () => fetchListing({ data: { id } }),
  });

  if (listing.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (listing.isError || !listing.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-destructive">Anunțul nu poate fi încărcat acum sau nu mai există.</p>
      </div>
    );
  }
  return <ListingDetail listing={listing.data} />;
}

function BackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/app/anunturi-particulari">
        <ArrowLeft className="size-4" /> Înapoi la anunțuri
      </Link>
    </Button>
  );
}

function ListingDetail({ listing }: { listing: OwnerListing }) {
  const place = [listing.zone, listing.city ?? listing.location, listing.county]
    .filter(Boolean)
    .join(", ");
  const transaction = transactionLabel(listing.transactionType);
  const details: [string, string | null][] = [
    ["Tip proprietate", listing.propertyType?.trim() || null],
    ["Camere", listing.rooms !== null ? String(listing.rooms) : null],
    ["Suprafață", listing.surface !== null ? `${listing.surface} m²` : null],
    ["Etaj", listing.floor],
    [
      "Preț pe m²",
      listing.pricePerM2 !== null ? money(listing.pricePerM2, listing.currency) : null,
    ],
    ["Tip anunț", transaction],
    ["Sursă", SOURCE_LABELS[listing.source] ?? listing.source],
    [
      "Adăugat",
      listing.firstSeenAt ? new Date(listing.firstSeenAt).toLocaleDateString("ro-RO") : null,
    ],
  ];

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={listing.title?.trim() || "Anunț fără titlu"}
        description={place || undefined}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Gallery images={listing.images} title={listing.title?.trim() || "Fotografie anunț"} />
          {listing.description ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-2 font-semibold">Descriere</h2>
              <p className="whitespace-pre-line break-words text-sm text-muted-foreground">
                {listing.description}
              </p>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{SOURCE_LABELS[listing.source] ?? listing.source}</Badge>
              {transaction ? (
                <span className="text-xs text-muted-foreground">{transaction}</span>
              ) : null}
            </div>
            {listing.price !== null ? (
              <p className="text-2xl font-bold text-primary">
                {money(listing.price, listing.currency)}
              </p>
            ) : (
              <p className="font-medium text-muted-foreground">Preț nedisponibil</p>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              {details
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
            </dl>
            {place ? (
              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>{place}</span>
              </p>
            ) : null}
            <div className="flex flex-col gap-2 pt-1">
              {listing.url ? (
                <Button asChild>
                  <a href={listing.url} target="_blank" rel="noopener noreferrer">
                    Anunțul original <ExternalLink className="size-4" />
                  </a>
                </Button>
              ) : null}
            </div>
          </section>

          <Comments listingId={listing.id} />
        </div>
      </div>
    </div>
  );
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Anunțul nu are fotografii.
      </div>
    );
  }
  const current = Math.min(index, images.length - 1);
  return (
    <section className="space-y-2">
      <div className="relative overflow-hidden rounded-lg border border-border bg-muted">
        <img
          src={images[current]}
          alt={`${title} — poza ${current + 1}`}
          className="aspect-[4/3] w-full object-cover"
        />
        {images.length > 1 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2"
              aria-label="Poza anterioară"
              disabled={current === 0}
              onClick={() => setIndex(current - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              aria-label="Poza următoare"
              disabled={current >= images.length - 1}
              onClick={() => setIndex(current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <span className="absolute bottom-2 right-2 rounded bg-background/80 px-2 py-0.5 text-xs">
              {current + 1} / {images.length}
            </span>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Poza ${i + 1}`}
              aria-current={i === current}
              className={`shrink-0 overflow-hidden rounded-md border-2 ${
                i === current ? "border-primary" : "border-transparent"
              }`}
            >
              <img src={src} alt="" loading="lazy" className="h-16 w-20 object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Comments({ listingId }: { listingId: string }) {
  const queryClient = useQueryClient();
  const fetchComments = useServerFn(getListingComments);
  const postComment = useServerFn(addListingComment);
  const [body, setBody] = useState("");

  const comments = useQuery({
    queryKey: ["listing-comments", listingId],
    queryFn: () => fetchComments({ data: { listingId } }),
  });

  const add = useMutation({
    mutationFn: (text: string) => postComment({ data: { listingId, body: text } }),
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["listing-comments", listingId] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Comentariul nu a putut fi salvat.");
    },
  });

  const submit = () => {
    const text = body.trim();
    if (!text || add.isPending) return;
    add.mutate(text);
  };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <MessageSquare className="size-4" />
        Comentarii{comments.data?.length ? ` (${comments.data.length})` : ""}
      </h2>
      <p className="text-xs text-muted-foreground">
        Comentariile sunt vizibile tuturor agenților care deschid acest anunț, din orice agenție.
      </p>

      {comments.isLoading ? (
        <Skeleton className="h-16" />
      ) : comments.data?.length ? (
        <ul className="space-y-3">
          {comments.data.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-background p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.authorName}</span>
                {c.orgName ? <span>{c.orgName}</span> : null}
                <span>
                  {new Date(c.createdAt).toLocaleString("ro-RO", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-line break-words text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Niciun comentariu încă.</p>
      )}

      <div className="space-y-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Scrie un comentariu pentru ceilalți agenți…"
          maxLength={LISTING_COMMENT_MAX_LENGTH}
          rows={3}
          aria-label="Comentariu nou"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {body.length}/{LISTING_COMMENT_MAX_LENGTH}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={!body.trim() || add.isPending}
            onClick={submit}
          >
            <Send className="size-4" /> {add.isPending ? "Se trimite…" : "Trimite"}
          </Button>
        </div>
      </div>
    </section>
  );
}
