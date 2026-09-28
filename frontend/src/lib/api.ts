import { cerrarSesionForzada } from "@/lib/sesion";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4001";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

// Un 401 con token significa que la sesión ya no es válida (cuenta
// desactivada, rol cambiado o token vencido): se cierra la sesión en vez de
// dejar que cada pantalla muestre el error por su cuenta. Sin token (login,
// carta pública) el 401 es un error normal y solo se reporta.
async function errorDeRespuesta(res: Response, conToken: boolean): Promise<ApiError> {
  const body = await res.json().catch(() => null);
  const mensaje = body?.error?.toString() ?? `Error ${res.status}`;
  if (res.status === 401 && conToken) cerrarSesionForzada(mensaje);
  return new ApiError(mensaje, res.status);
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

  if (!res.ok) throw await errorDeRespuesta(res, Boolean(token));

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

  if (!res.ok) throw await errorDeRespuesta(res, true);
  return res.json();
}
