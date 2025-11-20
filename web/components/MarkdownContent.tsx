import { useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";

type Props = {
  source: string;
  className?: string;
};

export function MarkdownContent({ source, className = "" }: Props) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  return (
    <div
      className={`markdown-body ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

