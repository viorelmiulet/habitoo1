/**
 * Înregistrarea adaptoarelor disponibile. Importat o singură dată de engine.
 */
import { registerCollectorAdapter } from "./adapters";
import { olxAdapter } from "./olx/adapter";

registerCollectorAdapter(olxAdapter);
