import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DocumentDetail, DocumentRevision, DocumentSummary, DocumentTemplate } from "@/lib/domain";
import { queryKeys } from "@/lib/query-client";

export function useTemplates() {
  return useQuery({ queryKey: queryKeys.templates, queryFn: async () => (await api<{ templates: DocumentTemplate[] }>("/templates")).templates, staleTime: 5 * 60_000 });
}
export function useTemplate(id: string, version: string) {
  return useQuery({ queryKey: queryKeys.template(id, version), queryFn: () => api<DocumentTemplate>(`/templates/${id}/${version}`), enabled: Boolean(id && version), staleTime: 5 * 60_000 });
}
export function useDocuments() {
  return useQuery({ queryKey: queryKeys.documents, queryFn: async () => (await api<{ documents: DocumentSummary[] }>("/documents?includeArchived=true")).documents });
}
export function useDocument(id: string) {
  return useQuery({ queryKey: queryKeys.document(id), queryFn: () => api<DocumentDetail>(`/documents/${id}`), enabled: Boolean(id) });
}
export function useRevisions(id: string) {
  return useQuery({ queryKey: queryKeys.revisions(id), queryFn: async () => (await api<{ revisions: DocumentRevision[] }>(`/documents/${id}/revisions`)).revisions, enabled: Boolean(id) });
}
