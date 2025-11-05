import React from 'react';

const { createElement: h } = React;

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  type?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  autoComplete,
  className = '',
  ...props
}, ref) => {
  return h('input', {
    ref,
    type,
    value,
    onChange,
    placeholder,
    disabled,
    autoComplete,
    className: `w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 disabled:cursor-not-allowed disabled:opacity-65 ${className}`,
    ...props
  });
});

Input.displayName = 'Input';

export default Input;

