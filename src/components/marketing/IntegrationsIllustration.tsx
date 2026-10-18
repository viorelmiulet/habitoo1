import { Check, Building2 } from "lucide-react";
import { PortalLogo } from "@/components/app/PortalLogo";
import { StatusBadge } from "@/components/app/StatusBadge";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { mockPhotos } from "./mock-data";
import { getPortalDefinition } from "@/lib/portals/registry";

const nodes = [
  { id: "storia", status: "Publicat", tone: "success" as const },
  { id: "imobiliare_ro", status: null, tone: "success" as const },
  { id: "vdi", status: "Lead nou", tone: "success" as const },
  { id: "romimo", status: null, tone: "success" as const },
  { id: "clickimob", status: "Se sincronizează", tone: "warning" as const },
  { id: "properstar", status: null, tone: "success" as const },
  { id: "imospot", status: "Publicat", tone: "success" as const },
  { id: "lacheie", status: null, tone: "success" as const },
];

export function IntegrationsIllustration() {
  return (
    <div role="img" aria-label="Un anunț din Habitoo publicat pe mai multe portaluri imobiliare" className="integration-map mx-auto mt-10 max-w-5xl">
      <div aria-hidden="true" className="integration-map-content">
        <div className="integration-map-lines">{nodes.map((n, i) => <span key={n.id} className={`integration-line integration-line-${i}`} />)}</div>
        <div className="integration-map-listing rounded-lg border border-gold/40 bg-card p-4 shadow-float">
          <div className="mb-3 flex items-center justify-between gap-3"><BrandLogo className="h-5 w-auto" /><Building2 className="size-4 text-muted-foreground" /></div>
          <img src={mockPhotos.living} alt="" width={320} height={160} className="h-28 w-full rounded-md object-cover" />
          <p className="mt-3 text-sm font-semibold text-navy">Apartament 2 camere · 73.000 €</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-success"><Check className="size-3.5" /> Pregătit pentru publicare</div>
        </div>
        <div className="integration-map-nodes">{nodes.map((node, i) => {
          const portal = getPortalDefinition(node.id);
          if (!portal) return null;
          return <div key={node.id} className={`integration-node integration-node-${i}`}>
            <div className="flex items-center gap-2.5"><PortalLogo portalId={node.id} name={portal.display_name} size={40} /><span className="text-xs font-semibold text-navy">{portal.display_name}</span></div>
            {node.status && <StatusBadge tone={node.tone} dot className="mt-2 text-[10px]">{node.status}</StatusBadge>}
          </div>;
        })}</div>
      </div>
    </div>
  );
}