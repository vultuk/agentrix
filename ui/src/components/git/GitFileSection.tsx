import React from 'react';

const { createElement: h } = React;

interface GitFileItem {
  path: string;
  previousPath?: string;
  status?: string;
  kind?: string;
}

interface GitFileSectionProps {
  items: GitFileItem[] | null;
  emptyLabel: string;
  onSelect?: (item: GitFileItem) => void;
}

export default function GitFileSection({ items, emptyLabel, onSelect }: GitFileSectionProps) {
  if (!items || items.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-neutral-500">{emptyLabel}</p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-800">
      {items.map((item) => {
        const key = `${item.path || ''}:${item.previousPath || ''}:${item.status || ''}:${item.kind || ''}`;
        return (
          <li key={key} className="px-1 py-1">
            <button
              type="button"
              onClick={() => {
                if (typeof onSelect === 'function') {
                  onSelect(item);
                }
              }}
              className="w-full rounded-md px-2 py-2 text-left transition hover:bg-neutral-800/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500/60"
            >
              <div className="min-w-0 text-sm">
                <p className="truncate text-neutral-200" title={item.path}>
                  {item.path}
                </p>
                {item.previousPath ? (
                  <p className="truncate text-[11px] uppercase tracking-wide text-neutral-500" title={item.previousPath}>
                    from {item.previousPath}
                  </p>
                ) : null}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

