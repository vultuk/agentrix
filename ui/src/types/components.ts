/**
 * Common component prop types
 */

import type { ReactNode } from 'react';

// Common props
export interface BaseComponentProps {
  className?: string;
  children?: ReactNode;
}

// Button props
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends BaseComponentProps {
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// Input props
export interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  type?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

// Modal props
export interface ModalProps extends BaseComponentProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  maxWidth?: string;
}

// Badge props
export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface BadgeProps extends BaseComponentProps {
  variant?: BadgeVariant;
}

// Error message props
export interface ErrorMessageProps {
  message: string | null | undefined;
  className?: string;
}

