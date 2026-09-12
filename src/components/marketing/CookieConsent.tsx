import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CATEGORIES, OPEN_PREFERENCES_EVENT, readConsent, saveConsent } from "@/lib/cookie-consent";

/**
 * Banner de consimțământ pentru site-ul public. Nu se randează în aplicația
 * autentificată (crm.habitoo.ro), unde folosim doar cookie-uri strict necesare.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const saved = readConsent();
    if (saved) {
      setAnalytics(saved.analytics);
      setMarketing(saved.marketing);
    } else {
      setVisible(true);
    }
    const openPanel = () => {
      const current = readConsent();
      setAnalytics(current?.analytics ?? false);
      setMarketing(current?.marketing ?? false);
      setPanelOpen(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, openPanel);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, openPanel);
  }, []);

  const persist = (choice: { analytics: boolean; marketing: boolean }) => {
    saveConsent(choice);
    setAnalytics(choice.analytics);
    setMarketing(choice.marketing);
    setPanelOpen(false);
    setVisible(false);
  };

  return (
    <>
      {visible ? (
        <div
          role="region"
          aria-label="Consimțământ cookie-uri"
          className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-6 sm:pb-6"
        >
          {/* Cele trei acțiuni au aceeași greutate vizuală: refuzul este la fel
              de accesibil ca acceptarea (cerință legală, nu preferință). */}
          <div className="panel mx-auto flex w-full max-w-5xl flex-col gap-3 p-4 sm:gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Folosim cookie-uri strict necesare pentru funcționarea site-ului. Pentru analiză și
              marketing avem nevoie de acordul tău. Poți refuza sau îți poți retrage acordul
              oricând.{" "}
              <Link to="/politica-de-confidentialitate" className="font-medium text-navy underline">
                Politica de confidențialitate
              </Link>
            </p>
            <div className="grid gap-2 sm:grid-cols-3 lg:shrink-0">
              <Button
                variant="outline"
                className="sm:min-w-36"
                onClick={() => persist({ analytics: true, marketing: true })}
              >
                Acceptă toate
              </Button>
              <Button
                variant="outline"
                className="sm:min-w-36"
                onClick={() => persist({ analytics: false, marketing: false })}
              >
                Doar necesare
              </Button>
              <Button variant="outline" className="sm:min-w-36" onClick={() => setPanelOpen(true)}>
                Personalizează
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Preferințe cookie-uri</DialogTitle>
            <DialogDescription>
              Alege categoriile pe care le accepți. Poți reveni oricând din linkul „Preferințe
              cookie-uri” din footer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {CATEGORIES.map((cat) => {
              const checked =
                cat.id === "necessary" ? true : cat.id === "analytics" ? analytics : marketing;
              const setChecked = (v: boolean) =>
                cat.id === "analytics" ? setAnalytics(v) : setMarketing(v);
              return (
                <div key={cat.id} className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor={`cookie-${cat.id}`} className="text-sm font-medium">
                      {cat.label}
                      {cat.locked ? " (mereu active)" : null}
                    </Label>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {cat.description}
                    </p>
                  </div>
                  <Switch
                    id={`cookie-${cat.id}`}
                    checked={checked}
                    disabled={cat.locked}
                    aria-label={`Cookie-uri ${cat.label}`}
                    onCheckedChange={cat.locked ? undefined : setChecked}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => persist({ analytics: false, marketing: false })}
            >
              Refuz tot
            </Button>
            <Button onClick={() => persist({ analytics, marketing })}>Salvează preferințele</Button>
          </DialogFooter>

          <p className="text-xs text-muted-foreground">
            Detalii în{" "}
            <Link to="/politica-de-confidentialitate" className="font-medium text-navy underline">
              Politica de confidențialitate
            </Link>
            .
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
