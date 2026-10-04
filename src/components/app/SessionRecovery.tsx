/**
 * Recuperarea sesiunii după ce tabul a stat deschis mult timp: ecran de eroare
 * cu „Reîncearcă”, reîncercare la revenirea în tab și redirect curat la login
 * când sesiunea nu mai este validă.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const SESSION_SLOW_MS = 15_000;

type RefetchResult = { data?: unknown; error?: unknown; isError?: boolean };

export type SessionRecoveryInput = {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<RefetchResult>;
  startAutoRefresh: () => Promise<unknown> | unknown;
  /** Sesiunea nu mai e validă: curăță și trimite la login. */
  onExpired: () => void;
  slowMs?: number;
};

export function useSessionRecovery({
  data,
  isLoading,
  isError,
  refetch,
  startAutoRefresh,
  onExpired,
  slowMs = SESSION_SLOW_MS,
}: SessionRecoveryInput) {
  const [slow, setSlow] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), slowMs);
    return () => clearTimeout(timer);
  }, [isLoading, slowMs]);

  const retry = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRetrying(true);
    try {
      try {
        await startAutoRefresh();
      } catch {
        // reîmprospătarea automată e doar un ajutor; refetch-ul decide
      }
      const result = await refetch();
      // Fără eroare și fără utilizator: sesiunea a expirat.
      if (!result.isError && result.data === null) onExpired();
    } finally {
      busy.current = false;
      setRetrying(false);
      setSlow(false);
    }
  }, [refetch, startAutoRefresh, onExpired]);

  const needsRecovery = isError || slow || (data === undefined && !isLoading);
  const needsRef = useRef(needsRecovery);
  needsRef.current = needsRecovery || data === undefined;

  useEffect(() => {
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      if (needsRef.current) void retry();
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [retry]);

  return { showError: isError || slow, retrying, retry };
}

export function SessionRecoveryScreen({
  onRetry,
  retrying,
}: {
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <div role="alert" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm space-y-4 text-center">
        <p className="text-base font-medium text-foreground">Nu am putut reîncărca sesiunea</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry} disabled={retrying}>
            <RefreshCw className={retrying ? "size-4 animate-spin" : "size-4"} />
            Reîncearcă
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reîncarcă pagina
          </Button>
        </div>
      </div>
    </div>
  );
}
