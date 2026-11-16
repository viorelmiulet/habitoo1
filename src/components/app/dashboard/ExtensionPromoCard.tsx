// Cardul compact „Habitoo Catch” de pe Acasă: instalare din Chrome Web Store
// și legătură spre conectare; cu dispozitiv conectat arată doar starea și store-ul.
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Puzzle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listExtensionTokens } from "@/lib/extension.functions";
import { CHROME_EXTENSION_URL } from "@/components/marketing/chrome-extension-content";
import { cn } from "@/lib/utils";

export function ExtensionPromoCard({ className }: { className?: string }) {
  const list = useServerFn(listExtensionTokens);
  const q = useQuery({ queryKey: ["extension-tokens"], queryFn: () => list() });
  const connected = (q.data ?? []).length > 0;
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6", className)}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-dark">
            <Puzzle className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Habitoo Catch – extensia Chrome</h2>
            <p className="text-sm text-muted-foreground">
              {connected
                ? "Extensia este conectată."
                : "Preia anunțuri de pe portaluri direct în CRM, cu proprietarul asociat automat ca contact."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <a href={CHROME_EXTENSION_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" /> Instalează din Chrome Web Store
            </a>
          </Button>
          {!connected && (
            <Button asChild variant="outline" size="sm">
              <Link to="/app/extensie/conectare" search={{ nonce: undefined }}>Conectează extensia</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
