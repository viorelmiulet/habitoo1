/** Registrul de adaptoare: singurul loc care leagă un portal de codul lui. */
import type { PortalAdapter } from "../adapter";
import { clickimobAdapter } from "./clickimob.server";
import { imoveAdapter } from "./imove.server";
import { imospotAdapter } from "./imospot.server";
import { oferteImobiliareAdapter } from "./oferteimobiliare.server";
import { homepitchAdapter } from "./homepitch.server";
import { storiaAdapter } from "./storia.server";

const ADAPTERS: Record<string, PortalAdapter> = {
  clickimob: clickimobAdapter,
  imove: imoveAdapter,
  imospot: imospotAdapter,
  oferteimobiliare: oferteImobiliareAdapter,
  homepitch: homepitchAdapter,
  storia: storiaAdapter,
};

export function getPortalAdapter(portalId: string): PortalAdapter | null {
  return ADAPTERS[portalId] ?? null;
}
