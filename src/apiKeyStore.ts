const GEMINI_API_KEY_STORAGE_KEY = 'rhter_gemini_key';

export function getApiKey(): string | null {
  return localStorage.getItem(GEMINI_API_KEY_STORAGE_KEY);
}

export function setApiKey(key: string): void {
  localStorage.setItem(GEMINI_API_KEY_STORAGE_KEY, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(GEMINI_API_KEY_STORAGE_KEY);
}
