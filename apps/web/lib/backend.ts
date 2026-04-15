'use client';

const LOCAL_BACKEND_URL = 'http://localhost:7878';
const TIMEOUT_MS = 500;

let cachedAvailability: boolean | null = null;

export async function isLocalBackendAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${LOCAL_BACKEND_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timer);
    cachedAvailability = res.ok;
  } catch {
    cachedAvailability = false;
  }

  return cachedAvailability;
}

export function resetBackendCache(): void {
  cachedAvailability = null;
}

export { LOCAL_BACKEND_URL };
