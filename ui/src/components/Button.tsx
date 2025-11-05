import React from 'react';

const { createElement: h } = React;

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-500/80 text-neutral-900 hover:bg-emerald-400',
  secondary: 'border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800',
  danger: 'border border-rose-500/60 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  ghost: 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/70',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2 py-1 text-xs',
  md: 'px-3 py-1.5 text-sm',
  lg: 'px-4 py-2 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'secondary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}, ref) => {
  const variantClass = BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary;
  const sizeClass = BUTTON_SIZES[size] || BUTTON_SIZES.md;

  return h(
    'button',
    {
      ref,
      type,
      onClick,
      disabled,
      className: `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-65 ${variantClass} ${sizeClass} ${className}`,
      ...props
    },
    children
  );
});

Button.displayName = 'Button';

export default Button;

