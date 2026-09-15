import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  session: ["session"] as const,
  profiles: ["profiles"] as const,
  storage: ["storage"] as const,
  templates: ["templates"] as const,
  template: (id: string, version: string) => ["template", id, version] as const,
  documents: ["documents", { includeArchived: true }] as const,
  document: (id: string) => ["document", id] as const,
  revisions: (id: string) => ["revisions", id] as const,
  generations: ["generations"] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: false },
  },
});

export function clearSensitiveQueries() {
  const sensitive = new Set(["documents", "document", "revisions", "generations"]);
  queryClient.removeQueries({ predicate: (query) => sensitive.has(String(query.queryKey[0])) });
}
