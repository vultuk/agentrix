import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import * as storage from '../services/storage/localStorage.js';

/**
 * Custom hook to sync state with localStorage
 */
export function useLocalStorage(
  key: string,
  defaultValue: string
): [string, Dispatch<SetStateAction<string>>] {
  const [value, setValue] = useState<string>(() => {
    const stored = storage.getItem(key);
    if (stored === null) {
      return defaultValue;
    }
    return stored;
  });

  useEffect(() => {
    storage.setItem(key, value);
  }, [key, value]);

  return [value, setValue];
}

/**
 * Custom hook to sync JSON state with localStorage
 */
export function useLocalStorageJSON<T>(
  key: string,
  defaultValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    return storage.getJSON<T>(key, defaultValue);
  });

  useEffect(() => {
    storage.setJSON(key, value);
  }, [key, value]);

  return [value, setValue];
}

/**
 * Custom hook to sync numeric state with localStorage
 */
export function useLocalStorageNumber(
  key: string,
  defaultValue: number
): [number, Dispatch<SetStateAction<number>>] {
  const [value, setValue] = useState<number>(() => {
    return storage.getNumber(key, defaultValue) ?? defaultValue;
  });

  useEffect(() => {
    storage.setNumber(key, value);
  }, [key, value]);

  return [value, setValue];
}

