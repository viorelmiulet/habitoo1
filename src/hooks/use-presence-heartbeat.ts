import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startPresenceHeartbeat } from "@/lib/chat/presence";

/** Salvează activitatea cât CRM-ul e deschis și fila vizibilă; oprit în impersonare. */
export function usePresenceHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return startPresenceHeartbeat(() => void supabase.rpc("chat_touch_presence"));
  }, [enabled]);
}

/** Ceas care se actualizează la fiecare minut (pentru textele „Activ acum X min”). */
export function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}
