import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchAgencyPage } from "@/lib/public-profiles.functions";

export function AgencyDescriptionPreview({ slug }: { slug: string | null }) {
  const fetchPage = useServerFn(fetchAgencyPage);
  const { data, isPending, isError } = useQuery({
    queryKey: ["agency-description-preview", slug],
    queryFn: () => slug ? fetchPage({ data: { slug, page: 1 } }) : null,
    enabled: Boolean(slug), staleTime: 0,
  });
  return <div className="space-y-2 text-sm">
    <p className="font-semibold text-foreground">Descriere automată</p>
    <p className="text-muted-foreground">Se afișează cât timp nu ai o descriere proprie.</p>
    {data?.agency.automaticDescription ? <p className="whitespace-pre-line break-words leading-relaxed text-muted-foreground">{data.agency.automaticDescription}</p>
      : <p className="text-muted-foreground">{isError ? "Previzualizarea nu a putut fi încărcată." : slug && isPending ? "Se încarcă…" : "Nu există oferte publicate pentru descrierea automată."}</p>}
  </div>;
}