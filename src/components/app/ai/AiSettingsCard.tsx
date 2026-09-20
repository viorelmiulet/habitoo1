/**
 * Setări → AI: starea Habitoo AI, providerul activ, limitele și consumul.
 * Nu afișează niciodată chei, prompturi interne sau erori tehnice brute, iar
 * providerul este citit de la server (nu hardcodat în interfață).
 *
 * Funcțiile AI se activează exclusiv de administratorul platformei, per agenție;
 * aici sunt doar afișate.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAiStatus } from "@/lib/ai/ai.functions";
import { useAiFeatures } from "@/hooks/use-ai-features";
import { AI_FEATURES } from "@/lib/ai/features/keys";

export function AiSettingsCard() {
  const fetchStatus = useServerFn(getAiStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["ai", "status"],
    queryFn: () => fetchStatus(),
  });
  const { features } = useAiFeatures();

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Habitoo AI</CardTitle>
            <CardDescription>
              Asistentul intern al agenției. Citește doar date din agenția ta și nu execută acțiuni.
            </CardDescription>
          </div>
          {isLoading ? null : (
            <Badge variant={data?.configured ? "default" : "secondary"}>
              {data?.configured ? "Configurat" : "Neconfigurat"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">
            Starea asistentului nu a putut fi citită. Reîncarcă pagina.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{data.message}</p>

            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Funcții AI disponibile agenției</p>
              <ul className="mt-2 space-y-1">
                {AI_FEATURES.map((feature) => (
                  <li key={feature.key} className="flex items-center justify-between gap-3">
                    <span>{feature.label}</span>
                    <Badge variant={features[feature.key] ? "default" : "secondary"}>
                      {features[feature.key] ? "Activată" : "Neactivată"}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Activarea se face de administratorul platformei, pentru fiecare agenție.
              </p>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Furnizor</dt>
                <dd className="text-sm font-medium">{data.providerLabel}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Model</dt>
                <dd className="text-sm font-medium">{data.model ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">Conexiune</dt>
                <dd className="text-sm font-medium">
                  {data.configured ? "Activă" : "Lipsește cheia furnizorului"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-muted-foreground">
                  Furnizori pregătiți pentru viitor
                </dt>
                <dd className="text-sm font-medium">
                  {data.plannedProviders.join(", ") || "—"}
                </dd>
              </div>
            </dl>

            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Limite de utilizare</p>
              <p className="text-muted-foreground">
                {data.limits.perUserMinute} cereri/minut și {data.limits.perUserHour} cereri/oră per
                utilizator, {data.limits.perOrganizationHour} cereri/oră per agenție, maximum{" "}
                {data.limits.maxMessageChars} de caractere pe mesaj.
              </p>
            </div>

            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Consum (ultimele 30 de zile)</p>
              {data.usage ? (
                <p className="text-muted-foreground">
                  {data.usage.requestsLast30d} cereri, dintre care {data.usage.requestsLast24h} în
                  ultimele 24 de ore; {data.usage.failures30d} eșecuri. Tokenuri:{" "}
                  {data.usage.inputTokens30d ?? 0} intrare / {data.usage.outputTokens30d ?? 0}{" "}
                  ieșire.
                </p>
              ) : (
                <p className="text-muted-foreground">Consumul este disponibil în cadrul unei agenții.</p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium">Ce poate citi asistentul</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
                {data.tools.map((tool) => (
                  <li key={tool.name}>{tool.description}</li>
                ))}
              </ul>
            </div>

            <Button asChild variant="outline" disabled={!data.configured || !data.featureEnabled}>
              <Link to="/app/ai">Deschide Habitoo AI</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
