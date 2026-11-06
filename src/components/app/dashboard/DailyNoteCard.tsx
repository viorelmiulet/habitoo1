/** „Notița zilei”: notiță personală (RLS: doar proprietarul), salvare automată. */
import { useEffect, useRef, useState } from "react";
import { NotebookPen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";

const MAX = 2000;
type Status = "idle" | "saving" | "saved" | "error";

export function DailyNoteCard({ className }: { className?: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const id = u.user?.id ?? null;
      if (!alive || !id) return;
      setUserId(id);
      const { data } = await supabase.from("user_notes").select("content").eq("user_id", id).maybeSingle();
      if (!alive) return;
      saved.current = data?.content ?? "";
      setText(saved.current);
      setLoaded(true);
    })();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function save(value: string) {
    if (!userId || value === saved.current) return;
    setStatus("saving");
    const { error } = await supabase
      .from("user_notes")
      .upsert({ user_id: userId, content: value, updated_at: new Date().toISOString() });
    if (error) return setStatus("error");
    saved.current = value;
    setStatus("saved");
  }

  function onChange(v: string) {
    const value = v.slice(0, MAX);
    setText(value);
    setStatus("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(value), 2000);
  }

  function clear() {
    if (timer.current) clearTimeout(timer.current);
    setText("");
    setEditing(false);
    void save("");
  }

  const empty = text.trim() === "";
  const showEditor = editing || !empty;

  return (
    <section className={className}>
      <div className="mb-4 flex min-w-0 items-center justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-gold-tint text-gold-dark">
            <NotebookPen className="size-4" aria-hidden />
          </span>
          <span className="truncate">Notița zilei</span>
        </h2>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {status === "saving" ? "Se salvează…" : status === "saved" ? "Salvat" : status === "error" ? "Nu s-a salvat" : ""}
        </span>
      </div>
      {!loaded ? null : showEditor ? (
        <>
          <Textarea
            value={text}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              if (timer.current) clearTimeout(timer.current);
              void save(text);
            }}
            maxLength={MAX}
            rows={6}
            autoFocus={editing && empty}
            placeholder="Scrie aici ce vrei să nu uiți…"
            aria-label="Notița zilei"
            className="resize-none"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {text.length} / {MAX}
            </span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button type="button" className="font-medium text-destructive hover:underline" disabled={empty}>
                  Golește
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Golești notița?</AlertDialogTitle>
                  <AlertDialogDescription>Textul notiței se șterge definitiv.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Renunță</AlertDialogCancel>
                  <AlertDialogAction onClick={clear}>Golește</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          <span className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground">
            <NotebookPen className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium">Nicio notiță încă.</p>
          <button type="button" onClick={() => setEditing(true)} className="mt-2 text-sm font-medium text-primary hover:underline">
            + Adaugă notiță
          </button>
        </div>
      )}
    </section>
  );
}
