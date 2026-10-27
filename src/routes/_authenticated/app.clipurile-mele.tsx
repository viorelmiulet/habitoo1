import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Film, Music2 } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { EmptyState } from "@/components/app/EmptyState";
import { QueryError } from "@/components/app/QueryError";
import { appHead } from "@/components/app/app-head";
import { Button } from "@/components/ui/button";
import { getGeneratedClips } from "@/lib/generated-video-clips.functions";
import { CLIPS_PAGE_SIZE, clipMusicLabel } from "@/lib/generated-video-clips";
import { VIDEO_FORMATS } from "@/lib/property-video";
import { formatDateTime } from "@/lib/format";
import { formatDuration } from "@/lib/video-music";

const clipsQuery = (page: number) => queryOptions({ queryKey: ["generated-video-clips", page], queryFn: () => getGeneratedClips({ data: { page } }) });
const title = "Clipurile mele — Habitoo CRM";
const description = "Istoricul clipurilor generate și muzica folosită în fiecare clip.";
export const Route = createFileRoute("/_authenticated/app/clipurile-mele")({
  validateSearch: (search: Record<string, unknown>) => ({ page: Math.max(1, Math.min(100000, Math.floor(Number(search.page) || 1))) }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(clipsQuery(deps.page)),
  head: () => ({ ...appHead(title), meta: [...appHead(title).meta, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ClipsPage,
  errorComponent: ClipsError,
  notFoundComponent: () => <p>Pagina nu este disponibilă.</p>,
});

function ClipsError({ error }: { error: unknown }) {
  const router = useRouter();
  return <QueryError error={error} onRetry={() => void router.invalidate()} />;
}

function ClipsPage() {
  const { page } = Route.useSearch();
  const { data } = useSuspenseQuery(clipsQuery(page));
  const pages = Math.max(1, Math.ceil(data.total / CLIPS_PAGE_SIZE));
  return <div data-tour="clips-page" className="space-y-6">
    <PageHeader title="Clipurile mele" />
    <p className="text-sm text-muted-foreground">{data.total} {data.total === 1 ? "clip" : "clipuri"}</p>
    {data.items.length === 0 ? <EmptyState icon={Film} title="Niciun clip înregistrat" /> : <ul className="divide-y divide-border">
      {data.items.map((clip) => <li data-tour="clip-item" key={clip.id} className="grid min-w-0 gap-3 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-1">
          <p className="font-medium break-words">{clip.property_reference ? `${clip.property_reference} · ` : ""}{clip.property_title}</p>
          <p className="text-xs text-muted-foreground break-all">{clip.file_name}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(clip.created_at)} · {VIDEO_FORMATS[clip.format as keyof typeof VIDEO_FORMATS].label} · {formatDuration(clip.duration_sec)}</p>
          {clip.property_id ? <Button asChild variant="link" className="h-auto p-0"><Link to="/app/properties/$id" params={{ id: clip.property_id }}>Proprietate</Link></Button> : null}
        </div>
        <div data-tour="clip-music" className="flex min-w-0 items-start gap-2">
          <Music2 className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 space-y-1"><p className="font-medium break-words">{clipMusicLabel(clip)}</p>
            {clip.music_style || clip.music_artist ? <p className="text-sm text-muted-foreground">{[clip.music_style, clip.music_artist].filter(Boolean).join(" · ")}</p> : null}
            {clip.music_license ? <p className="text-xs text-muted-foreground break-words">{clip.music_license}</p> : null}
          </div>
        </div>
      </li>)}
    </ul>}
    <nav aria-label="Paginare clipuri" className="flex items-center justify-between gap-3">
      <Button asChild variant="outline" disabled={page <= 1}><Link to="/app/clipurile-mele" search={{ page: Math.max(1, page - 1) }} disabled={page <= 1}><ChevronLeft className="size-4" />Înapoi</Link></Button>
      <span className="text-sm tabular-nums">{page} / {pages}</span>
      <Button asChild variant="outline" disabled={page >= pages}><Link to="/app/clipurile-mele" search={{ page: page + 1 }} disabled={page >= pages}>Înainte<ChevronRight className="size-4" /></Link></Button>
    </nav>
  </div>;
}