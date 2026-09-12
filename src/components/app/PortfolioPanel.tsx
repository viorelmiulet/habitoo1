/**
 * Panoul „Portofoliu” din pagina unei proprietăți: lista proprietăților
 * agenției, cu miniatură, referință, status, preț și steluța de favorit.
 *
 * Vizibilitatea rămâne cea din baza de date (RLS): un agent vede exact ce are
 * dreptul să vadă, adminul vede întreaga agenție. Componenta nu conține reguli
 * proprii de acces.
 */
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";

import { PropertyThumb, usePropertyCovers } from "@/components/app/PropertyThumb";
import { StatusBadge } from "@/components/app/StatusBadge";
import { supabase } from "@/integrations/supabase/client";
import { toastError } from "@/lib/errors";
import { formatMoney } from "@/lib/format";
import { propertyStatusLabels, propertyStatusTone } from "@/lib/labels";
import { cn } from "@/lib/utils";

const LIMIT = 12;

type Row = {
  id: string;
  title: string;
  reference: string | null;
  status: keyof typeof propertyStatusLabels;
  price: number | null;
  currency: string | null;
  rooms: number | null;
  surface: number | null;
  transaction_kind: string;
};

export function PortfolioPanel({
  orgId,
  userId,
  currentPropertyId,
}: {
  orgId: string | undefined;
  userId: string | undefined;
  currentPropertyId: string;
}) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["portfolio-panel", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("properties")
        .select(
          "id,title,reference,status,price,currency,rooms,surface,transaction_kind",
          { count: "exact" },
        )
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .neq("status", "archived" as never)
        .order("updated_at", { ascending: false })
        .limit(LIMIT + 1);
      if (error) throw error;
      return { rows: (data ?? []) as Row[], count: count ?? 0 };
    },
  });

  const rows = (data?.rows ?? []).filter((r) => r.id !== currentPropertyId).slice(0, LIMIT);
  const coverOf = usePropertyCovers(rows.map((r) => r.id));

  const { data: favoriteIds = [] } = useQuery({
    queryKey: ["property-favorites", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_favorites")
        .select("property_id")
        .eq("user_id", userId as string);
      if (error) throw error;
      return data.map((f) => f.property_id);
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (propertyId: string) => {
      if (!userId || !orgId) throw new Error("Sesiune indisponibilă.");
      if (favoriteIds.includes(propertyId)) {
        const { error } = await supabase
          .from("property_favorites")
          .delete()
          .eq("property_id", propertyId)
          .eq("user_id", userId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("property_favorites").insert({
          organization_id: orgId,
          property_id: propertyId,
          user_id: userId,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["property-favorites", userId] }),
    onError: (e: Error) => toastError(e),
  });

  return (
    <aside className="rounded-2xl bg-card p-4 ring-1 ring-border/60">
      <h2 className="text-sm font-medium">
        Portofoliu{" "}
        <span className="text-muted-foreground">· {data?.count ?? 0} active</span>
      </h2>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Nu există alte proprietăți în circulație.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((p) => {
            const favorite = favoriteIds.includes(p.id);
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-border/60 p-2 transition-colors hover:border-primary/40"
              >
                <PropertyThumb
                  propertyId={p.id}
                  title={p.title}
                  cover={coverOf(p.id)}
                  className="size-14 rounded-xl"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/app/properties/$id"
                    params={{ id: p.id }}
                    className="block truncate text-sm font-medium hover:text-primary"
                  >
                    {p.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    {[
                      p.reference,
                      p.rooms ? `${p.rooms} cam.` : null,
                      p.surface ? `${p.surface} m²` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusBadge tone={propertyStatusTone[p.status]}>
                      {propertyStatusLabels[p.status]}
                    </StatusBadge>
                    <span className="truncate text-xs font-medium">
                      {formatMoney(p.price, p.currency)}
                      {p.transaction_kind === "rent" ? "/lună" : ""}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavorite.mutate(p.id)}
                  title={favorite ? "Scoate din favorite" : "Adaugă la favorite"}
                  aria-label={favorite ? "Scoate din favorite" : "Adaugă la favorite"}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                >
                  <Star className={cn("size-4", favorite && "fill-primary text-primary")} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
