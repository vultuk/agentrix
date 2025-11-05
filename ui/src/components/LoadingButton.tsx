import React from 'react';
import Button from './Button.js';
import { renderSpinner } from './Spinner.js';

const { createElement: h } = React;

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface LoadingButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  children: React.ReactNode;
  loading?: boolean;
  loadingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

/**
 * Button component with built-in loading state
 */
const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(({
  children,
  loading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  type = 'button',
  className = '',
  ...props
}, ref) => {
  const isDisabled = disabled || loading;
  const displayText = loading && loadingText ? loadingText : children;
  
  // Determine spinner color based on variant
  const spinnerClass = variant === 'primary' 
    ? 'text-neutral-900' 
    : variant === 'danger' || variant === 'secondary'
    ? 'text-rose-200'
    : 'text-neutral-100';

  return h(
    Button,
    {
      ref,
      type,
      variant,
      size,
      disabled: isDisabled,
      onClick: loading ? undefined : onClick,
      'aria-busy': loading ? ('true' as any) : undefined,
      className,
      ...props
    },
    loading 
      ? h(
          'span',
          { className: 'inline-flex items-center gap-2' },
          renderSpinner(spinnerClass),
          displayText
        )
      : children
  );
});

LoadingButton.displayName = 'LoadingButton';

export default LoadingButton;

