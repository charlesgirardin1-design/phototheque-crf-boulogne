"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Appel JSON vers l'API de l'application ; redirige vers la connexion si la session a expiré. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth/login") {
    window.location.replace("/"); // rechargement complet : purge l'état client
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Erreur ${res.status}`);
  return data as T;
}

/** Envoi direct d'un fichier vers une URL signée du stockage, avec progression et annulation. */
export function putFile(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Le stockage a refusé le fichier (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Erreur réseau pendant l'envoi"));
    xhr.onabort = () => reject(new DOMException("Envoi annulé", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
