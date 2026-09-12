import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { supabase } from "@/integrations/supabase/client";

export type SavedView = {
  id: string;
  name: string;
  module: string;
  config: Record<string, unknown>;
};

/** Filtre salvate per utilizator și per modul (persistate în backend). */
export function useSavedViews(
  module: string,
  orgId: string | null | undefined,
  userId: string | undefined,
) {
  const queryClient = useQueryClient();
  const key = ["saved-views", module, userId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: Boolean(userId),
    queryFn: async (): Promise<SavedView[]> => {
      const { data, error } = await supabase
        .from("saved_views")
        .select("id,name,module,config")
        .eq("module", module)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((v) => ({
        id: v.id,
        name: v.name,
        module: v.module,
        config: (v.config ?? {}) as Record<string, unknown>,
      }));
    },
  });

  const save = useMutation({
    mutationFn: async (payload: { name: string; config: Record<string, unknown> }) => {
      if (!orgId || !userId) throw new Error("Lipsește agenția");
      const { error } = await supabase.from("saved_views").insert({
        organization_id: orgId,
        user_id: userId,
        module,
        name: payload.name,
        config: payload.config as never,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Filtru salvat");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toastError(e),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("saved_views").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Filtru șters");
      void queryClient.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toastError(e),
  });

  return { views: query.data ?? [], isLoading: query.isLoading, save, remove };
}
