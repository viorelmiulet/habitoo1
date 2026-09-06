/** Registrul de adaptoare: singurul loc care leagă un portal de codul lui. */
import type { PortalAdapter } from "../adapter";
import { clickimobAdapter } from "./clickimob.server";
import { imoveAdapter } from "./imove.server";
import { imospotAdapter } from "./imospot.server";
import { homepitchAdapter } from "./homepitch.server";

const ADAPTERS: Record<string, PortalAdapter> = {
  clickimob: clickimobAdapter,
  imove: imoveAdapter,
  imospot: imospotAdapter,
  homepitch: homepitchAdapter,
};


export function getPortalAdapter(portalId: string): PortalAdapter | null {
  return ADAPTERS[portalId] ?? null;
}
