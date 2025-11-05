import React from 'react';

const { createElement: h } = React;

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}

export default function Label({ children, htmlFor, className = '', ...props }: LabelProps) {
  return h(
    'label',
    {
      htmlFor,
      className: `block text-xs uppercase tracking-wide text-neutral-400 ${className}`,
      ...props
    },
    children
  );
}

