import { randomBytes, randomInt } from 'node:crypto';

import { PASSWORD_LENGTH } from '../config/constants.js';

function pickRandomChar(source) {
  return source[randomInt(0, source.length)];
}

function shuffleArray(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
}

export function generateRandomPassword() {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const all = lowercase + uppercase + symbols;

  const chars = [
    pickRandomChar(lowercase),
    pickRandomChar(uppercase),
    pickRandomChar(symbols),
  ];

  while (chars.length < PASSWORD_LENGTH) {
    chars.push(pickRandomChar(all));
  }

  shuffleArray(chars);
  return chars.join('');
}

export function generateSessionToken() {
  return randomBytes(24).toString('hex');
}
