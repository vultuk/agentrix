/**
 * Authentication API service
 */

import { apiPost, apiGet, AuthenticationError, isApiError } from './api-client.js';
import type { AuthStatusResponse } from '../../types/api.js';

/**
 * Login with password
 */
export async function login(password: string): Promise<boolean> {
  try {
    await apiPost('/api/auth/login', { password }, { errorPrefix: 'Login failed' });
    return true;
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw new Error('Incorrect password. Try again.');
    }
    if (isApiError(error)) {
      throw new Error(error.message);
    }
    throw new Error('Login failed. Please try again.');
  }
}

/**
 * Logout current session
 */
export async function logout(): Promise<boolean> {
  try {
    await apiPost('/api/auth/logout', undefined, { errorPrefix: 'Logout failed' });
    return true;
  } catch (error) {
    if (isApiError(error)) {
      throw new Error(error.message);
    }
    throw new Error('Logout failed');
  }
}

/**
 * Check if user is authenticated
 */
export async function checkSession(): Promise<boolean> {
  try {
    const body = await apiGet<AuthStatusResponse>('/api/auth/status');
    return body && body.authenticated ? true : false;
  } catch {
    return false;
  }
}

