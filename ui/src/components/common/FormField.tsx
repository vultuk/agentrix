import React from 'react';
import Label from './Label.js';

const { createElement: h } = React;

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  helperText?: string;
  className?: string;
}

export default function FormField({ 
  label, 
  htmlFor, 
  children, 
  helperText, 
  className = '' 
}: FormFieldProps) {
  return h(
    'div',
    { className: `space-y-2 ${className}` },
    h(Label, { htmlFor }, label),
    children,
    helperText && h(
      'p',
      { className: 'text-xs text-neutral-500 leading-relaxed' },
      helperText
    )
  );
}

