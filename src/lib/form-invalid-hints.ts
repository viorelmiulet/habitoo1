/**
 * Prezentare pentru erorile native de validare din formularele de proprietate:
 * mesajul browserului apare sub câmp (13px, destructive), câmpul primește
 * aria-invalid (bordura input-error), iar pagina se derulează la primul câmp greșit.
 * Mesajele trăiesc în starea React (context citit de Input/Textarea după `id`),
 * fără inserări directe în DOM. Nu schimbă regulile de validare.
 */
import { createContext, useCallback, useContext, useMemo, useState, type FormEvent } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
export type InvalidHints = Record<string, string>;

function isField(el: EventTarget | null): el is Field {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export const InvalidHintsContext = createContext<InvalidHints | null>(null);

/** Mesajul de eroare pentru câmpul cu acest `id`, dacă formularul are erori afișate. */
export function useInvalidHint(id: string | undefined): string | undefined {
  const hints = useContext(InvalidHintsContext);
  return id && hints ? hints[id] : undefined;
}

/** Reducer pur (testabil): adaugă sau șterge mesajul unui câmp. */
export function nextHints(prev: InvalidHints, id: string, message: string | null): InvalidHints {
  if (message === null) {
    if (!(id in prev)) return prev;
    const { [id]: _removed, ...rest } = prev;
    return rest;
  }
  return prev[id] === message ? prev : { ...prev, [id]: message };
}

/** Handlere pentru `<form onInvalidCapture onInputCapture>` + valoarea contextului. */
export function useFormInvalidHints() {
  const [hints, setHints] = useState<InvalidHints>({});
  const onInvalidCapture = useCallback((e: FormEvent<HTMLFormElement>) => {
    const field = e.target;
    if (!isField(field)) return;
    e.preventDefault();
    const first = e.currentTarget.querySelector<Field>(":invalid:not(fieldset)");
    if (field.id) {
      const message = field.validationMessage;
      setHints((prev) => nextHints(prev, field.id, message));
    }
    if (first === field) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      field.focus({ preventScroll: true });
    }
  }, []);
  const onInputCapture = useCallback((e: FormEvent<HTMLFormElement>) => {
    const field = e.target;
    if (isField(field) && field.id && field.checkValidity()) {
      setHints((prev) => nextHints(prev, field.id, null));
    }
  }, []);
  const handlers = useMemo(() => ({ onInvalidCapture, onInputCapture }), [onInvalidCapture, onInputCapture]);
  return { hints, handlers };
}
