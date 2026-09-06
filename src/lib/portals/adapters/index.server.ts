/** Registrul de adaptoare: singurul loc care leagă un portal de codul lui. */
import type { PortalAdapter } from "../adapter";
import { clickimobAdapter } from "./clickimob.server";

const ADAPTERS: Record<string, PortalAdapter> = {
  clickimob: clickimobAdapter,
};

export function getPortalAdapter(portalId: string): PortalAdapter | null {
  return ADAPTERS[portalId] ?? null;
}
