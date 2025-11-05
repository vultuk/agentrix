import React, { useState, useEffect, useRef, useCallback } from 'react';

const { createElement: h } = React;

interface LoginScreenProps {
  onAuthenticated: () => void;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (isSubmitting) {
        return;
      }
      const trimmed = password.trim();
      if (!trimmed) {
        setError('Password is required.');
        return;
      }
      setIsSubmitting(true);
      setError(null);
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ password: trimmed })
        });
        if (response.ok) {
          setPassword('');
          if (typeof onAuthenticated === 'function') {
            onAuthenticated();
          }
          return;
        }
        if (response.status === 401) {
          setError('Incorrect password. Try again.');
          return;
        }
        let message = 'Login failed. Please try again.';
        try {
          const data = await response.json();
          if (data && typeof data.error === 'string') {
            message = data.error;
          }
        } catch {}
        setError(message);
      } catch {
        setError('Unable to reach the server. Ensure terminal-worktree is running.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [isSubmitting, password, onAuthenticated]
  );

  return h(
    'div',
    {
      className:
        'min-h-screen bg-neutral-950 flex items-center justify-center px-4 text-neutral-100'
    },
    h(
      'div',
      {
        className:
          'w-full max-w-sm space-y-6 rounded-lg border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl'
      },
      h(
        'div',
        { className: 'space-y-1' },
        h('h1', { className: 'text-lg font-semibold text-neutral-50' }, 'terminal-worktree'),
        h(
          'p',
          { className: 'text-sm text-neutral-400' },
          'Enter the password printed by the CLI to continue.'
        )
      ),
      h(
        'form',
        {
          className: 'space-y-4',
          onSubmit: handleSubmit
        },
        h(
          'div',
          { className: 'space-y-2' },
          h(
            'label',
            { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
            'Password'
          ),
          h('input', {
            ref: inputRef,
            type: 'password',
            value: password,
            onChange: (event) => {
              setPassword(event.target.value);
              if (error) {
                setError(null);
              }
            },
            autoComplete: 'current-password',
            placeholder: 'Paste password here',
            className:
              'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
          })
        ),
        error ? h('p', { className: 'text-xs text-rose-300' }, error) : null,
        h(
          'button',
          {
            type: 'submit',
            disabled: isSubmitting,
            className:
              'w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500/80 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-65'
          },
          isSubmitting ? 'Logging in…' : 'Log in'
        )
      )
    )
  );
}
