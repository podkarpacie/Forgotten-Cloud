/** Tiny typed REST client for the panel API. */

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep status text */
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return fetch(`/api${path}`, { credentials: "same-origin" }).then((r) => handle<T>(r));
}

export function apiSend<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  return fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then((r) => handle<T>(r));
}

export async function apiUpload(path: string, bytes: ArrayBuffer | Blob): Promise<void> {
  await fetch(`/api${path}`, { method: "PUT", credentials: "same-origin", body: bytes });
}

export async function fileText(serverId: string, path: string): Promise<string> {
  const response = await fetch(
    `/api/servers/${serverId}/file?path=${encodeURIComponent(path)}`,
    { credentials: "same-origin" },
  );
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      message = ((await response.json()) as { error?: string }).error ?? message;
    } catch {}
    throw new Error(message);
  }
  return response.text();
}
