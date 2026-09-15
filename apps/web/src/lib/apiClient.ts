import axios, { AxiosError } from 'axios';

const baseURL = import.meta.env.VITE_API_BASE_URL;
if (!baseURL) {
  // eslint-disable-next-line no-console
  console.error('VITE_API_BASE_URL is not set. Copy .env.example to .env first.');
}

export const apiClient = axios.create({ baseURL, timeout: 15000 });

let accessToken: string | null = localStorage.getItem('sd_access_token');
let refreshToken: string | null = localStorage.getItem('sd_refresh_token');

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  accessToken = tokens?.accessToken ?? null;
  refreshToken = tokens?.refreshToken ?? null;
  if (tokens) {
    localStorage.setItem('sd_access_token', tokens.accessToken);
    localStorage.setItem('sd_refresh_token', tokens.refreshToken);
  } else {
    localStorage.removeItem('sd_access_token');
    localStorage.removeItem('sd_refresh_token');
  }
}

export function getAccessToken() {
  return accessToken;
}

apiClient.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (!refreshToken) return null;
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${baseURL}/auth/refresh`, { refreshToken })
      .then((res) => {
        accessToken = res.data.accessToken;
        localStorage.setItem('sd_access_token', accessToken!);
        return accessToken;
      })
      .catch(() => {
        setTokens(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export interface NormalizedApiError {
  status: number | null;
  message: string;
  details?: unknown;
  isNetworkError: boolean;
}

apiClient.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ error?: { message: string; details?: unknown } }>) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !(original as { _retried?: boolean })._retried) {
      (original as { _retried?: boolean })._retried = true;
      const newToken = await tryRefresh();
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(original);
      }
    }
    const normalized: NormalizedApiError = {
      status: error.response?.status ?? null,
      message: error.response?.data?.error?.message ?? (error.request ? 'Network error — check your connection.' : error.message),
      details: error.response?.data?.error?.details,
      isNetworkError: !error.response,
    };
    return Promise.reject(normalized);
  },
);
