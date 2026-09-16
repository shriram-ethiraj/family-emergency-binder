import { FileText } from "lucide-react";
import { PageLoading } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import { useTemplates } from "@/features/records/queries";
import { TemplateCard } from "./template-card";
import { TemplateFolderPicker } from "@/components/shared/template-folder-picker";
import { useTemplateCatalog } from "@/app/template-context";

export function Component() {
  const query = useTemplates();
  const catalog = useTemplateCatalog();
  if (query.isPending) return <PageLoading />;
  return <div className="space-y-7"><PageHeader eyebrow="Template library" title="Print templates" description={`${catalog.templateCount} template versions loaded from ${catalog.folderName}.`} actions={<TemplateFolderPicker label="Choose another folder" />} />
    {catalog.error && <Alert variant="destructive"><AlertTitle>New folder was not loaded</AlertTitle><AlertDescription>{catalog.error}</AlertDescription></Alert>}
    {catalog.diagnostics.length > 0 && <Alert><AlertTitle>Template folder warnings</AlertTitle><AlertDescription><ul className="mt-2 list-disc space-y-1 pl-5">{catalog.diagnostics.map((item, index) => <li key={`${item.path}-${index}`}><strong>{item.path}:</strong> {item.message}</li>)}</ul></AlertDescription></Alert>}
    {query.isError ? <Alert variant="destructive"><AlertTitle>Templates unavailable</AlertTitle><AlertDescription>{errorMessage(query.error)}</AlertDescription></Alert> : !query.data.length ? <Card className="border-dashed"><CardHeader className="items-center py-14 text-center"><FileText className="size-8 text-muted-foreground" /><CardTitle>No print templates</CardTitle><CardDescription>No templates are currently enabled.</CardDescription></CardHeader></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.map((template) => <TemplateCard key={`${template.templateId}-${template.version}`} template={template} />)}</div>}
  </div>;
}
