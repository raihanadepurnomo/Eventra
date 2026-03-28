const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiHttpError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data: any) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.data = data;
  }
}

function getToken(): string | null {
  return localStorage.getItem('eventra_token');
}

export function setToken(token: string) {
  localStorage.setItem('eventra_token', token);
}

export function clearToken() {
  localStorage.removeItem('eventra_token');
}

function toSnakeCase(str: string) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function convertKeysToSnakeCase(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(v => convertKeysToSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      result[toSnakeCase(key)] = convertKeysToSnakeCase(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

async function request<T>(method: string, path: string, body?: any): Promise<T> {
  const headers: Record<string, string> = {};
  
  const isFormData = body instanceof FormData;
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let payload = body;
  if (!isFormData && body) {
    payload = JSON.stringify(convertKeysToSnakeCase(body));
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: payload,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const message = err.detail
      ? `${err.error || `HTTP ${res.status}`} (${err.detail})`
      : (err.error || `HTTP ${res.status}`);
    throw new ApiHttpError(message, res.status, err);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),

  // File upload helper
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }

    return res.json();
  },
};
