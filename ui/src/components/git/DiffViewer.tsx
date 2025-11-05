import React, { useEffect, useMemo, useRef } from 'react';
import { html as renderDiffHtml } from 'diff2html';
import hljs from 'highlight.js';

import 'diff2html/bundles/css/diff2html.min.css';
import 'highlight.js/styles/github-dark.css';

const DEFAULT_OPTIONS = Object.freeze({
  drawFileList: false,
  matching: 'lines',
  diffStyle: 'word',
  renderNothingWhenEmpty: false,
});

interface DiffViewerProps {
  diff: string;
  view?: 'split' | 'unified';
}

export default function DiffViewer({ diff, view = 'split' }: DiffViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const rendered = useMemo(() => {
    if (!diff || typeof diff !== 'string') {
      return '';
    }
    try {
      return renderDiffHtml(diff, {
        ...DEFAULT_OPTIONS,
        outputFormat: view === 'split' ? 'side-by-side' : 'line-by-line',
      });
    } catch (error) {
      console.error('Failed to render diff', error);
      return '';
    }
  }, [diff, view]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    containerRef.current.querySelectorAll('pre code').forEach((element) => {
      try {
        hljs.highlightElement(element as HTMLElement);
      } catch (error) {
        console.warn('Failed to highlight diff block', error);
      }
    });
  }, [rendered]);

  if (!rendered) {
    return (
      <p className="text-sm text-neutral-400">No differences to display.</p>
    );
  }

  return (
    <div
      ref={containerRef}
      className="diff-viewer overflow-auto"
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
}

