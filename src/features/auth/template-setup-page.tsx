import { AlertTriangle, FileJson2, ShieldCheck } from "lucide-react";
import { Navigate } from "react-router";
import { useTemplateCatalog } from "@/app/template-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TemplateFolderPicker } from "@/components/shared/template-folder-picker";
import { AuthCard } from "./auth-card";

export function Component() {
  const templates = useTemplateCatalog();
  if (templates.ready) return <Navigate to="/login" replace />;
  return <AuthCard title="Load your print templates" description="Choose the templates folder included beside this app. The JSON files are read for this session only.">
    <div className="rounded-xl border bg-muted/25 p-4">
      <div className="flex items-start gap-3"><FileJson2 className="mt-0.5 size-5 text-primary" /><div><p className="text-sm font-medium">Select the whole templates folder</p><p className="mt-1 text-sm leading-6 text-muted-foreground">The app scans JSON files in this folder and its subfolders. It does not change or upload them.</p></div></div>
    </div>
    {templates.error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Templates could not be loaded</AlertTitle><AlertDescription>{templates.error}</AlertDescription></Alert>}
    <TemplateFolderPicker className="h-11 w-full" />
    <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Closing or refreshing this page clears the selected templates. You will choose the folder again before opening your vault.</p></div>
  </AuthCard>;
}
