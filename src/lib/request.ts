export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError(
      "The server returned an unexpected response. Please try again.",
      res.status,
    );
  }
  if (!res.ok)
    throw new ApiError(
      data.error || "Unable to complete this request.",
      res.status,
      data.requestId,
    );
  return data;
}
