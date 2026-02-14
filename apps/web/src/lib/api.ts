const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3010"

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${path}`

  const headers: Record<string, string> = { ...options.headers as Record<string, string> }
  if (options.body) {
    headers["Content-Type"] = "application/json"
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const body = await response.json()
      if (body.error) message = body.error
      if (body.message) message = body.message
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, message)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json()
}

export const api = {
  get<T>(path: string, options?: RequestInit): Promise<T> {
    return request<T>(path, { ...options, method: "GET" })
  },
  post<T>(path: string, data?: unknown, options?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  put<T>(path: string, data?: unknown, options?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...options,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  patch<T>(path: string, data?: unknown, options?: RequestInit): Promise<T> {
    return request<T>(path, {
      ...options,
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    })
  },
  delete<T>(path: string, options?: RequestInit): Promise<T> {
    return request<T>(path, { ...options, method: "DELETE" })
  },
}
