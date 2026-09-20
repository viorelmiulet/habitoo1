/**
 * Habitoo AI — interfață minimă de conversație (Stage 11A).
 *
 * Interfața trimite doar textul utilizatorului către server functions; nu
 * cunoaște providerul, cheia sau prompturile. Toate stările au mesaje sigure,
 * fără detalii tehnice.
 */
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app/PageHeader";
import { appHead } from "@/components/app/app-head";
import { AiFeatureGate } from "@/components/app/ai/AiFeatureGate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AiWorkflowCard } from "@/components/app/ai/AiWorkflowCard";
import {
  getAiConversation,
  getAiStatus,
  listAiConversations,
  sendAiMessage,
  type AIResponseLike,
} from "@/lib/ai/ai-client";

export const Route = createFileRoute("/_authenticated/app/ai")({
  head: () => appHead("Habitoo AI — asistentul agenției"),
  component: GatedAiPage,
});

type ChatEntry = {
  role: "user" | "assistant";
  content: string;
  warnings?: string[];
  /** Indicator de context: pe ce categorii de date s-a bazat răspunsul. */
  contextUsed?: string[];
  sources?: { label: string }[];
};

const CONTEXT_LABELS: Record<string, string> = {
  property: "proprietăți",
  client: "clienți",
  lead: "leaduri",
  acp: "analize ACP",
  activity: "activități",
  document: "documente",
};

function AiPage() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getAiStatus);
  const fetchConversations = useServerFn(listAiConversations);
  const fetchConversation = useServerFn(getAiConversation);
  const send = useServerFn(sendAiMessage);

  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ["ai", "status"], queryFn: () => fetchStatus() });
  const conversations = useQuery({
    queryKey: ["ai", "conversations"],
    queryFn: () => fetchConversations(),
  });

  const history = useQuery({
    queryKey: ["ai", "conversation", conversationId],
    queryFn: () => fetchConversation({ data: { conversationId: conversationId as string } }),
    enabled: Boolean(conversationId) && entries.length === 0,
  });

  const shown = useMemo<ChatEntry[]>(() => {
    if (entries.length > 0) return entries;
    return (history.data ?? []).map((row) => ({ role: row.role, content: row.content }));
  }, [entries, history.data]);

  const mutation = useMutation({
    mutationFn: (message: string) =>
      send({ data: { message, conversationId, propertyId: null } }) as Promise<
        AIResponseLike & { contextUsed?: string[]; sources?: { label: string }[] }
      >,
    onSuccess: (response) => {
      if (response.conversationId) setConversationId(response.conversationId);
      if (response.status === "ok") {
        setEntries((prev) => [
          ...prev,
          {
            role: "assistant",
            content: response.answer,
            warnings: response.warnings,
            contextUsed: response.contextUsed ?? [],
            sources: response.sources ?? [],
          },
        ]);
        setError(null);
      } else {
        setError(response.message ?? "Asistentul nu a putut răspunde. Încearcă din nou.");
      }
      void queryClient.invalidateQueries({ queryKey: ["ai", "conversations"] });
    },
    onError: () => setError("Asistentul nu a putut răspunde. Încearcă din nou."),
  });

  const configured = status.data?.configured ?? false;
  const busy = mutation.isPending;
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  function submit() {
    const message = input.trim();
    if (message === "" || busy) return;
    setEntries((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setLastMessage(message);
    mutation.mutate(message);
  }

  function retry() {
    if (!lastMessage || busy) return;
    setError(null);
    mutation.mutate(lastMessage);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Habitoo AI"
        description="Asistentul intern al agenției tale. Citește proprietăți, clienți, leaduri și analize ACP."
      />

      {status.isLoading ? null : !configured ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            AI nu este configurat. Contactează administratorul platformei pentru activare.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-base">Conversații</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setConversationId(null);
                  setEntries([]);
                  setError(null);
                }}
              >
                Conversație nouă
              </Button>
              {(conversations.data ?? []).map((row) => (
                <Button
                  key={row.id}
                  variant={row.id === conversationId ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start truncate"
                  onClick={() => {
                    setConversationId(row.id);
                    setEntries([]);
                    setError(null);
                  }}
                >
                  {row.title}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-6">
              <div className="space-y-3">
                {shown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Întreabă, de exemplu: „Ce apartamente cu 3 camere am în portofoliu?”
                  </p>
                ) : (
                  shown.map((entry, index) => (
                    <div
                      key={`${entry.role}-${index}`}
                      className={
                        entry.role === "user"
                          ? "rounded-md bg-muted p-3 text-sm"
                          : "rounded-md border p-3 text-sm"
                      }
                    >
                      <p className="mb-1 text-xs uppercase text-muted-foreground">
                        {entry.role === "user" ? "Tu" : "Habitoo AI"}
                      </p>
                      <p className="whitespace-pre-wrap">{entry.content}</p>
                      {(entry.contextUsed ?? []).length > 0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Date folosite:{" "}
                          {(entry.contextUsed ?? [])
                            .map((category) => CONTEXT_LABELS[category] ?? category)
                            .join(", ")}
                          {(entry.sources ?? []).length > 0
                            ? ` · ${(entry.sources ?? []).length} surse`
                            : ""}
                        </p>
                      ) : null}
                      {(entry.warnings ?? []).map((warning) => (
                        <Badge key={warning} variant="secondary" className="mt-2 mr-2">
                          {warning}
                        </Badge>
                      ))}
                    </div>
                  ))
                )}
                {busy ? (
                  <p className="text-sm text-muted-foreground">Habitoo AI analizează datele…</p>
                ) : null}
                {error ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-destructive">{error}</p>
                    {lastMessage ? (
                      <Button size="sm" variant="outline" onClick={retry} disabled={busy}>
                        Încearcă din nou
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Scrie întrebarea ta…"
                  rows={3}
                  maxLength={status.data?.limits.maxMessageChars ?? 4000}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      submit();
                    }
                  }}
                />
                <div className="flex justify-end">
                  <Button onClick={submit} disabled={busy || input.trim() === ""}>
                    {busy ? "Se trimite…" : "Trimite"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="lg:col-start-2">
            <AiWorkflowCard />
          </div>
        </div>
      )}
    </div>
  );
}

/** Funcțiile AI sunt activate individual per agenție de administratorul platformei. */
function GatedAiPage() {
  return (
    <AiFeatureGate feature="ai_assistant">
      <AiPage />
    </AiFeatureGate>
  );
}
