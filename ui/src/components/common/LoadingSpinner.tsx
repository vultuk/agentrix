import React from 'react';
import { Loader2 } from 'lucide-react';

const { createElement: h } = React;

interface LoadingSpinnerProps {
  size?: number;
  className?: string;
}

export default function LoadingSpinner({ size = 16, className = '' }: LoadingSpinnerProps) {
  return h(Loader2, {
    size,
    className: `animate-spin ${className}`
  });
}

