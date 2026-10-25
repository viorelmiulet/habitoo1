/**
 * Helper-e server-only pentru răspunsurile HTTP și IP-ul apelantului.
 * Importul `@tanstack/react-start/server` trebuie să rămână într-un modul
 * `.server.ts`, ca să nu intre în graful clientului.
 */
import { getRequestHeader, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";

/** IP-ul utilizatorului, trimis Argus ca `client_ip` (doar IPv4 valid). */
export function argusClientIp(): string | null {
  const cf = getRequestHeader("cf-connecting-ip")?.trim();
  const forwarded = getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = cf || forwarded || "";
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(candidate) ? candidate : null;
}

/** Fără cache pe răspunsurile cu stare de conexiune. */
export function argusNoStore(): void {
  setResponseHeader("Cache-Control", "no-store");
}

/** Cod de stare pentru refuzurile de acces. */
export function argusResponseStatus(status: number): void {
  setResponseStatus(status);
}
