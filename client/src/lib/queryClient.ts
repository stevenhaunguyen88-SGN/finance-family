import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const raw = (await res.text()) || res.statusText;
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.message === "string") {
        message = parsed.message;
      }
    } catch {
      // raw is not JSON; fall back to it as-is
    }
    throw new Error(message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
  });

  // Mutation against an expired session — drop the cached auth state so the
  // app falls back to the login screen instead of looping with 401s.
  if (res.status === 401 && !url.startsWith("/api/auth/")) {
    queryClient.setQueryData(["/api/auth/me"], null);
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      credentials: "same-origin",
    });

    if (res.status === 401) {
      // Session expired or never logged in: invalidate the auth probe so the
      // AuthGate re-renders the login screen instead of leaving the user on a
      // broken page full of error toasts.
      queryClient.setQueryData(["/api/auth/me"], null);
      if (unauthorizedBehavior === "returnNull") return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
