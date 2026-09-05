import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";

/**
 * Hostname-ul cererii curente, disponibil identic pe server (SSR) și în browser.
 * Implementarea de server este eliminată din bundle-ul de client de compilator.
 */
export const getCurrentHostname = createIsomorphicFn()
  .server(() => {
    try {
      return getRequestHost({ xForwardedHost: true });
    } catch {
      return "";
    }
  })
  .client(() => window.location.hostname);
