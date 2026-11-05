// Recuperare după o publicare nouă: fișierele JS vechi dau 404, deci reîncărcăm
// pagina o singură dată (anti-buclă prin sessionStorage, fereastră 30 s).

export const STALE_RELOAD_KEY = "habitoo:stale-chunk-reload-at";
export const STALE_RELOAD_WINDOW_MS = 30_000;
export const STALE_EVENT = "habitoo:stale-version";

const PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg =
    typeof error === "string"
      ? error
      : typeof error === "object" && "message" in (error as object)
        ? String((error as { message?: unknown }).message ?? "")
        : "";
  return PATTERNS.some((p) => p.test(msg));
}

/** Decide: „reload” dacă nu a existat o reîncărcare în ultimele 30 s, altfel „message”. */
export function decideStaleAction(
  lastReloadAt: string | null,
  now: number,
): "reload" | "message" {
  const last = lastReloadAt ? Number(lastReloadAt) : NaN;
  if (Number.isFinite(last) && now - last >= 0 && now - last < STALE_RELOAD_WINDOW_MS) {
    return "message";
  }
  return "reload";
}

let intendedHref: string | null = null;
export function setIntendedHref(href: string | null) {
  intendedHref = href;
}

/** Reîncarcă (o dată) sau anunță UI-ul să arate mesajul. Returnează acțiunea. */
export function handleStaleVersion(targetHref?: string): "reload" | "message" | "noop" {
  if (typeof window === "undefined") return "noop";
  let last: string | null = null;
  try {
    last = window.sessionStorage.getItem(STALE_RELOAD_KEY);
  } catch {
    /* storage indisponibil */
  }
  const action = decideStaleAction(last, Date.now());
  if (action === "reload") {
    try {
      window.sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    const href = targetHref || intendedHref || window.location.href;
    if (href === window.location.href) window.location.reload();
    else window.location.assign(href);
  } else {
    window.dispatchEvent(new CustomEvent(STALE_EVENT));
  }
  return action;
}

let installed = false;
/** Înregistrare unică a ascultătorilor globali (apelat din useEffect în rădăcină). */
export function installStaleChunkHandler() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    handleStaleVersion();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      handleStaleVersion();
    }
  });
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error ?? event.message)) handleStaleVersion();
  });
}
