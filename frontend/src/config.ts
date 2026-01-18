const envBaseUrl = (import.meta as any).env?.VITE_API_BASE_URL as string | undefined;

const defaultBaseUrl = (() => {
  if (typeof window === 'undefined') return 'http://localhost:8005';

  if (window.location.port === '8005') return window.location.origin;

  return 'http://localhost:8005';
})();

export const API_BASE_URL = envBaseUrl || defaultBaseUrl;
