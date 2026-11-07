import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDynamicFeedRegistry } from "@/lib/dynamic-feed-portals.functions";
import { setBrowserFeedDefinitions } from "@/lib/feed-registry";
import { QueryError } from "./QueryError";
import { InlineLoading } from "./LoadingState";
export function DynamicFeedRegistry({ children }: { children: React.ReactNode }) {
  const read = useServerFn(getDynamicFeedRegistry);
  const result = useQuery({ queryKey: ["dynamic-feed-registry"], queryFn: () => read(), staleTime: 0, refetchOnWindowFocus: true });
  if (result.isError) return <QueryError error={result.error} onRetry={() => result.refetch()} />;
  if (!result.data) return <InlineLoading label="Se încarcă portalurile…" />;
  setBrowserFeedDefinitions(result.data);
  return children;
}