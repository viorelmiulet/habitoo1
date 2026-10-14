/** Safe, consistent filename for the client and agent versions. */
export function propertySheetFileName(reference?: string | null) {
  const code = (reference ?? "").trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
  return code ? `fisa-proprietate-${code}.pdf` : "fisa-proprietate.pdf";
}