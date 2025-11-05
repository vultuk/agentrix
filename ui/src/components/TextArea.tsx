import React from 'react';

const { createElement: h } = React;

interface TextAreaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

const TextArea = React.forwardRef<HTMLTextAreaElement, TextAreaProps>(({
  value,
  onChange,
  placeholder,
  rows = 3,
  disabled = false,
  className = '',
  ...props
}, ref) => {
  return h('textarea', {
    ref,
    value,
    onChange,
    placeholder,
    rows,
    disabled,
    className: `w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 resize-y min-h-[92px] disabled:cursor-not-allowed disabled:opacity-65 ${className}`,
    ...props
  });
});

TextArea.displayName = 'TextArea';

export default TextArea;

