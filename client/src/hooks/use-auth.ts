import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";

export interface AuthUser {
  id: number;
  username: string;
}

interface MeResponse {
  user: AuthUser;
}

const ME_KEY = ["/api/auth/me"] as const;

export function useAuth() {
  const query = useQuery<MeResponse | null>({
    queryKey: ME_KEY,
    queryFn: getQueryFn({ on401: "returnNull" }),
    staleTime: 60_000,
    retry: false,
  });

  const loginMut = useMutation({
    mutationFn: async (creds: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", creds);
      return res.json() as Promise<MeResponse>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(ME_KEY, data);
    },
  });

  const logoutMut = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(ME_KEY, null);
      queryClient.clear();
    },
  });

  return {
    user: query.data?.user ?? null,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data?.user,
    login: loginMut.mutateAsync,
    isLoggingIn: loginMut.isPending,
    loginError: loginMut.error as Error | null,
    logout: logoutMut.mutateAsync,
    isLoggingOut: logoutMut.isPending,
  };
}
