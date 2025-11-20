import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";

// Configure marked with a lean setup (no HTML input parsing other than markdown features).
marked.setOptions({
  breaks: true,
});

export function renderMarkdown(markdown: string): string {
  const raw = marked.parse(markdown || "");
  return DOMPurify.sanitize(raw as string);
}
