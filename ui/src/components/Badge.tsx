import React from 'react';

const { createElement: h } = React;

type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'danger';

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  default: 'bg-neutral-700/60 text-neutral-200',
  info: 'bg-sky-500/20 text-sky-300',
  success: 'bg-emerald-500/20 text-emerald-300',
  warning: 'bg-amber-500/20 text-amber-300',
  danger: 'bg-rose-500/20 text-rose-200',
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  const variantClass = BADGE_VARIANTS[variant] || BADGE_VARIANTS.default;
  
  return h(
    'span',
    {
      className: `inline-flex items-center rounded-full px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide ${variantClass} ${className}`
    },
    children
  );
}

