import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

const allowedTags = ["h2", "h3", "p", "strong", "em", "ul", "ol", "li", "blockquote", "a", "img", "br", "hr"];

export function renderSafeBlogContent(markdown: string) {
  const rendered = marked.parse(markdown, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(rendered, {
    allowedTags,
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "loading"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tag, attrs) => {
        const external = /^https?:\/\//i.test(attrs.href ?? "");
        return { tagName: "a", attribs: { ...attrs, ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) } };
      },
      img: (_tag, attrs) => ({ tagName: "img", attribs: { ...attrs, alt: attrs.alt || "Imagine articol", loading: "lazy" } }),
    },
  });
}
