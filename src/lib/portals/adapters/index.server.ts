/** Registrul de adaptoare: singurul loc care leagă un portal de codul lui. */
import type { PortalAdapter } from "../adapter";
import { clickimobAdapter } from "./clickimob.server";
import { imobiliareAdapter } from "./imobiliare.server";
import { imoveAdapter } from "./imove.server";
import { imospotAdapter } from "./imospot.server";
import { lacheieAdapter } from "./lacheie.server";
import { oferteImobiliareAdapter } from "./oferteimobiliare.server";
import { homepitchAdapter } from "./homepitch.server";
import { romimoAdapter } from "./romimo.server";
import { storiaAdapter } from "./storia.server";

const ADAPTERS: Record<string, PortalAdapter> = {
  clickimob: clickimobAdapter,
  imobiliare_ro: imobiliareAdapter,
  imove: imoveAdapter,
  imospot: imospotAdapter,
  lacheie: lacheieAdapter,
  oferteimobiliare: oferteImobiliareAdapter,
  homepitch: homepitchAdapter,
  romimo: romimoAdapter,
  storia: storiaAdapter,
};

export function getPortalAdapter(portalId: string): PortalAdapter | null {
  return ADAPTERS[portalId] ?? null;
}
