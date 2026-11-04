/**
 * Prezentare pentru erorile native de validare din formularele de proprietate:
 * mesajul browserului apare sub câmp (13px, destructive), câmpul primește
 * aria-invalid (bordura input-error), iar pagina se derulează la primul câmp greșit.
 * Nu schimbă regulile de validare — folosește doar `required`/`min`/etc. existente.
 */
import type { FormEvent } from "react";

const HINT_ATTR = "data-invalid-hint";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isField(el: EventTarget | null): el is Field {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function clearInvalidHint(field: Field) {
  field.removeAttribute("aria-invalid");
  const next = field.nextElementSibling;
  if (next?.hasAttribute(HINT_ATTR)) next.remove();
}

export function showInvalidHint(field: Field) {
  clearInvalidHint(field);
  field.setAttribute("aria-invalid", "true");
  const hint = document.createElement("p");
  hint.setAttribute(HINT_ATTR, "");
  hint.className = "mt-1 text-[13px] text-destructive";
  hint.textContent = field.validationMessage;
  field.insertAdjacentElement("afterend", hint);
}

/** Handlere pentru `<form onInvalidCapture onInputCapture>`. */
export const formInvalidHintHandlers = {
  onInvalidCapture(e: FormEvent<HTMLFormElement>) {
    const field = e.target;
    if (!isField(field)) return;
    e.preventDefault();
    const form = e.currentTarget;
    const first = form.querySelector<Field>(":invalid:not(fieldset)");
    showInvalidHint(field);
    if (first === field) {
      field.scrollIntoView({ behavior: "smooth", block: "center" });
      field.focus({ preventScroll: true });
    }
  },
  onInputCapture(e: FormEvent<HTMLFormElement>) {
    const field = e.target;
    if (isField(field) && field.getAttribute("aria-invalid") === "true" && field.checkValidity()) clearInvalidHint(field);
  },
};
