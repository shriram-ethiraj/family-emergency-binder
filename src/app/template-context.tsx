import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { loadTemplateFiles, replaceTemplates, type TemplateDiagnostic } from "@/lib/template-catalog";
import { queryClient } from "@/lib/query-client";

interface TemplateContextValue {
  ready: boolean;
  loading: boolean;
  folderName: string | null;
  templateCount: number;
  fileCount: number;
  diagnostics: TemplateDiagnostic[];
  error: string | null;
  choose(files: File[]): Promise<boolean>;
}

const TemplateContext = createContext<TemplateContextValue | null>(null);

export function TemplateProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [templateCount, setTemplateCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [diagnostics, setDiagnostics] = useState<TemplateDiagnostic[]>([]);
  const [error, setError] = useState<string | null>(null);

  const choose = useCallback(async (files: File[]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadTemplateFiles(files);
      replaceTemplates(result.templates);
      setFolderName(result.folderName);
      setTemplateCount(result.templates.length);
      setFileCount(result.fileCount);
      setDiagnostics(result.diagnostics);
      setReady(true);
      await queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === "templates" || query.queryKey[0] === "template" });
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The template folder could not be loaded");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(() => ({ ready, loading, folderName, templateCount, fileCount, diagnostics, error, choose }), [choose, diagnostics, error, fileCount, folderName, loading, ready, templateCount]);
  return <TemplateContext.Provider value={value}>{children}</TemplateContext.Provider>;
}

export function useTemplateCatalog() {
  const value = useContext(TemplateContext);
  if (!value) throw new Error("useTemplateCatalog must be used inside TemplateProvider");
  return value;
}
