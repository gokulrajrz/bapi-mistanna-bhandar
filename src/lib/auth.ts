import { useQuery } from "@tanstack/react-query";
import { api } from "./request";
import { isDemo } from "./api";
export type AuthSession = {
  user: { id: string; email: string } | null;
  role: "owner" | "manager" | null;
};
export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: ({ signal }) =>
      isDemo
        ? Promise.resolve({ user: null, role: null } as AuthSession)
        : api<AuthSession>("/api/auth/session", { signal }),
    staleTime: 30_000,
    retry: false,
  });
}
