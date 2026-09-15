import { FileText } from "lucide-react";
import { PageLoading } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/api";
import { useTemplates } from "@/features/records/queries";
import { TemplateCard } from "./template-card";

export function Component() {
  const query = useTemplates();
  if (query.isPending) return <PageLoading />;
  return <div className="space-y-7"><PageHeader eyebrow="Template library" title="Print templates" description="Browse available layouts and open sample PDFs filled with example information." />
    {query.isError ? <Alert variant="destructive"><AlertTitle>Templates unavailable</AlertTitle><AlertDescription>{errorMessage(query.error)}</AlertDescription></Alert> : !query.data.length ? <Card className="border-dashed"><CardHeader className="items-center py-14 text-center"><FileText className="size-8 text-muted-foreground" /><CardTitle>No print templates</CardTitle><CardDescription>No templates are currently enabled.</CardDescription></CardHeader></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{query.data.map((template) => <TemplateCard key={`${template.templateId}-${template.version}`} template={template} />)}</div>}
  </div>;
}
