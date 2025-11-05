import { randomBytes } from 'node:crypto';

const TOKEN_LENGTH = 32;
const PASSWORD_LENGTH = 12;
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a random session token
 * @returns Random token string
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('base64url');
}

/**
 * Generates a random password
 * @param length - Password length (default: 12)
 * @returns Random password string
 */
export function generateRandomPassword(length: number = PASSWORD_LENGTH): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i]! % CHARSET.length];
  }
  return result;
}
