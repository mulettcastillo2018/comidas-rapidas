const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.toString() ?? `Error ${res.status}`, res.status);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Para subir archivos (ej. imagen de producto): sin Content-Type manual, el
// navegador lo pone solo con el boundary correcto para el FormData.
export async function uploadFile<T>(path: string, file: File, fieldName: string, token: string): Promise<T> {
  const formData = new FormData();
  formData.append(fieldName, file);

  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.toString() ?? `Error ${res.status}`, res.status);
  }
  return res.json();
}
