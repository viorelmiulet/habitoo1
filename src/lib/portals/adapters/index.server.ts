/** Registrul de adaptoare: singurul loc care leagă un portal de codul lui. */
import type { PortalAdapter } from "../adapter";
import { clickimobAdapter, imobliAdapter, locuitAdapter, imobiliareplusAdapter } from "./clickimob.server";
import { imobiliareAdapter } from "./imobiliare.server";
import { imoveAdapter } from "./imove.server";
import { imospotAdapter } from "./imospot.server";
import { imo24Adapter } from "./imo24.server";
import { imopediaAdapter } from "./imopedia.server";
import { lacheieAdapter } from "./lacheie.server";
import { primulanuntAdapter } from "./primulanunt.server";
import { homepitchAdapter } from "./homepitch.server";
import { romimoAdapter } from "./romimo.server";
import { storiaAdapter } from "./storia.server";
import { vdiAdapter } from "./vdi.server";
import { olxDirectAdapter } from "./olx-direct.server";
import { zonataAdapter } from "./zonata.server";
import { homedirectAdapter } from "./homedirect.server";
import { oferaAdapter } from "./ofera.server";
import { zupAdapter } from "./zup.server";

const ADAPTERS: Record<string, PortalAdapter> = {
  clickimob: clickimobAdapter,
  imobli: imobliAdapter,
  locuit: locuitAdapter,
  imobiliareplus: imobiliareplusAdapter,
  imobiliare_ro: imobiliareAdapter,
  imove: imoveAdapter,
  imospot: imospotAdapter,
  imo24: imo24Adapter,
  imopedia: imopediaAdapter,
  lacheie: lacheieAdapter,
  primulanunt: primulanuntAdapter,
  homepitch: homepitchAdapter,
  romimo: romimoAdapter,
  storia: storiaAdapter,
  vdi: vdiAdapter,
  olx_direct: olxDirectAdapter,
  zonata: zonataAdapter,
  homedirect: homedirectAdapter,
  ofera: oferaAdapter,
  zup: zupAdapter,
};

export function getPortalAdapter(portalId: string): PortalAdapter | null {
  return ADAPTERS[portalId] ?? null;
}
