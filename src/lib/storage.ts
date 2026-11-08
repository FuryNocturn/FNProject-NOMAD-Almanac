import { useEffect, useState } from 'react'

const PREFIX = 'nomad-almanac:'

/**
 * Study progress and preferences live in this browser only. Storage can be
 * missing or throw (private window, blocked site data), so every access is
 * guarded and the app simply starts fresh.
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // Not persisting is acceptable; the app keeps working in memory.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    // ignore
  }
}

/** useState that is restored from, and written back to, storage. */
export function usePersistentState<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => load<T | null>(key, null) ?? initial())
  useEffect(() => save(key, value), [key, value])
  return [value, setValue] as const
}
