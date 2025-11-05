import React from 'react';
import { ChevronDown } from 'lucide-react';
import { formatCount } from '../../utils/formatting.js';

type Tone = 'neutral' | 'warning' | 'danger' | 'success' | 'info';

interface GitSectionHeaderProps {
  id: string;
  title: string;
  count: number;
  open: boolean;
  onToggle: (id: string) => void;
  tone?: Tone;
  truncated?: boolean;
}

export default function GitSectionHeader({
  id,
  title,
  count,
  open,
  onToggle,
  tone = 'neutral',
  truncated = false,
}: GitSectionHeaderProps) {
  const toneMap: Record<Tone, string> = {
    neutral: 'text-neutral-300',
    warning: 'text-amber-200',
    danger: 'text-rose-200',
    success: 'text-emerald-200',
    info: 'text-sky-200',
  };

  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500/60"
      aria-expanded={open ? 'true' : 'false'}
    >
      <span className={`flex items-center gap-2 ${toneMap[tone] || toneMap.neutral}`}>
        <span>{title}</span>
        <span className="rounded-full border border-current/40 px-1.5 py-[1px] text-[11px] font-semibold uppercase tracking-wide">
          {formatCount(count)}
          {truncated ? '+' : ''}
        </span>
      </span>
      <ChevronDown
        size={14}
        className={`text-neutral-500 transition-transform duration-200 ${open ? '-rotate-180' : 'rotate-0'}`}
      />
    </button>
  );
}

