import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { agencyPath, profileUrl } from "@/lib/marketing/agency-seo";

/** Read-only public profile link; the slug is DB-generated and immutable. */
export function PublicProfileLink({ slug }: { slug: string | null }) {
  const url = slug ? profileUrl(agencyPath(slug)) : null;
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold">Profilul public al agenției</Label>
      {url ? (
        <div className="flex flex-wrap items-center gap-2">
          <a href={url} target="_blank" rel="noreferrer" className="min-w-0 break-all text-sm text-primary underline-offset-2 hover:underline">
            {url}
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label="Copiază linkul profilului public"
            onClick={() => {
              void navigator.clipboard?.writeText(url).then(() => toast.success("Linkul a fost copiat."));
            }}
          >
            <Copy className="h-4 w-4" /> Copiază
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">Linkul profilului public se generează automat.</p>
      )}
    </div>
  );
}
