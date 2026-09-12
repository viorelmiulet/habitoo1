import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { toastError } from "@/lib/errors";
import { EmptyState } from "@/components/app/EmptyState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-session";
import { formatDateTime } from "@/lib/format";
import { DOCS_BUCKET, docPath, signedUrl, uploadToBucket, removeFromBucket } from "@/lib/storage";

type EntityType = "property" | "contact" | "request" | "lead";

function formatSize(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({
  entityType,
  entityId,
  orgId,
}: {
  entityType: EntityType;
  entityId: string;
  orgId: string | null | undefined;
}) {
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const queryKey = ["documents", entityType, entityId] as const;

  const { data: docs = [], isLoading } = useQuery({
    queryKey,
    enabled: Boolean(entityId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      if (!orgId) throw new Error("Agenția nu este configurată.");
      for (const file of Array.from(files)) {
        const path = docPath(orgId, entityType, entityId, file.name);
        await uploadToBucket(DOCS_BUCKET, path, file, file.type || undefined);
        const { error } = await supabase.from("documents").insert({
          organization_id: orgId,
          entity_type: entityType,
          entity_id: entityId,
          name: file.name,
          storage_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          created_by: user?.userId ?? null,
        } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Document(e) încărcat(e).");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toastError(e),
    onSettled: () => setUploading(false),
  });

  const remove = useMutation({
    mutationFn: async (doc: { id: string; storage_path: string }) => {
      await removeFromBucket(DOCS_BUCKET, [doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document șters.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => toastError(e),
  });

  const handleDownload = async (path: string, name: string) => {
    const url = await signedUrl(DOCS_BUCKET, path);
    if (!url) {
      toast.error("Nu s-a putut genera linkul de descărcare.");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Documente</h2>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                setUploading(true);
                upload.mutate(e.target.files);
              }
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <Upload className="size-4" /> {uploading ? "Se încarcă…" : "Încarcă document"}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Se încarcă…</p>
      ) : docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Niciun document"
          description="Încarcă contracte, acte sau alte fișiere."
        />
      ) : (
        <ul className="divide-y divide-border">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-3 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(d.size_bytes)} · {formatDateTime(d.created_at)}
                </p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDownload(d.storage_path, d.name)}
              >
                <Download className="size-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Ștergi documentul?</AlertDialogTitle>
                    <AlertDialogDescription>
                      „{d.name}” va fi șters definitiv. Această acțiune nu poate fi anulată.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anulează</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => remove.mutate({ id: d.id, storage_path: d.storage_path })}
                    >
                      Șterge
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
