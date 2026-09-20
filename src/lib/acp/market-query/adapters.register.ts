/**
 * Înregistrarea adaptoarelor de interogare live.
 *
 * Adaptoarele se adaugă unul câte unul, pe măsură ce o sursă ne permite
 * explicit interogarea. Înregistrarea nu activează nimic: o sursă este
 * întrebată doar dacă este activată în `market_query_sources`.
 */
import { imospotAdapter } from "./imospot/adapter.server";
import { registerMarketQueryAdapter } from "./port";

registerMarketQueryAdapter(imospotAdapter);

export {};
