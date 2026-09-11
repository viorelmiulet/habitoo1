// @vitest-environment jsdom
import { expect, test } from "vitest";
import DOMPurify from "dompurify";
const SAFE_URI = /^(?:https?:|mailto:|tel:|cid:|#|\/)/i;
let blockRemoteImages = true, blocked = 0;
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  const el = node as Element; const tag = el.tagName?.toUpperCase();
  for (const a of Array.from(el.attributes ?? [])) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  if (tag === "A") { const h = el.getAttribute("href") ?? ""; if (h && !SAFE_URI.test(h.trim())) el.removeAttribute("href");
    if (el.getAttribute("href")) { el.setAttribute("target","_blank"); el.setAttribute("rel","noopener noreferrer"); } }
  if (tag === "IMG") { el.removeAttribute("srcset"); const s = el.getAttribute("src") ?? "";
    if (s && !SAFE_URI.test(s.trim())) { el.removeAttribute("src"); return; }
    if (blockRemoteImages && /^https?:/i.test(s.trim())) { el.removeAttribute("src"); el.setAttribute("data-blocked-src", s); blocked++; } }
});
const san = (html: string, show = false) => { blockRemoteImages = !show; blocked = 0; return DOMPurify.sanitize(html, {
  USE_PROFILES: { html: true },
  FORBID_TAGS: ["style","form","input","button","select","textarea","iframe","object","embed","param","applet","script","svg","math","link","meta","base","frame","frameset"],
  FORBID_ATTR: ["srcset","formaction","background","style"],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["target","rel","data-blocked-src","loading","referrerpolicy"],
}); };
test("blochează conținut activ", () => {
  const out = san('<iframe src="x"></iframe><object></object><embed><script>x()</script><p onclick="x()">a</p><a href="javascript:alert(1)">l</a>');
  expect(out).not.toContain("iframe"); expect(out).not.toContain("object"); expect(out).not.toContain("embed");
  expect(out).not.toContain("script"); expect(out).not.toContain("onclick"); expect(out).not.toContain("javascript:");
});
test("linkuri externe izolate", () => {
  expect(san('<a href="https://x.ro">l</a>')).toContain('rel="noopener noreferrer"');
});
test("imaginile la distanță sunt blocate implicit, apoi afișate", () => {
  expect(san('<img src="https://t.ro/p.gif">')).toContain("data-blocked-src");
  expect(san('<img src="https://t.ro/p.gif">', true)).toContain('src="https://t.ro/p.gif"');
});
