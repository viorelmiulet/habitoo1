import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getImopediaBoostInfo, IMOPEDIA_BOOST_CACHE_MS } from "@/lib/portals/imopedia/boost.functions";

/** Informare la nivel de agenție; consumul rămâne exclusiv pe cardul ofertei. */
export function ImopediaPackageBoostInfo({ organizationId }: { organizationId?: string }) {
  const load = useServerFn(getImopediaBoostInfo);
  const info = useQuery({
    queryKey: ["imopedia-boost-package", organizationId ?? null] as const,
    queryFn: () => load({ data: organizationId ? { organizationId } : {} }),
    staleTime: IMOPEDIA_BOOST_CACHE_MS,
  });
  const error = info.isError
    ? (info.error as Error).message
    : info.data?.error;
  const available = info.data?.available;
  const text = info.isLoading
    ? "Pachet Imopedia: se citesc boost-urile…"
    : error
      ? `Boost-uri: necunoscute (${error})`
      : available === null || available === undefined
        ? "Pachet Imopedia: număr necunoscut de boost-uri disponibile"
        : `Pachet Imopedia: ${available} boost-uri disponibile`;

  return (
    <div className="border-t border-border px-4 py-3 sm:px-5">
      <p className="text-sm text-muted-foreground" data-imopedia-package-boosts>{text}</p>
    </div>
  );
}
