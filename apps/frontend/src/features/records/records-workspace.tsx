import { FilePlus2, Files, ShieldCheck } from "lucide-react";
import { Link, Outlet } from "react-router";
import { PageHeader } from "@/components/shared/page-header";
import { PageLoading } from "@/components/shared/loading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { errorMessage } from "@/lib/api";
import { prettyDate } from "@/lib/format";
import { RecordActions } from "./record-actions";
import { useDocuments, useTemplates } from "./queries";

export function Component() {
  const documents = useDocuments(); const templates = useTemplates(); const active = documents.data?.filter((item) => !item.archived).length ?? 0;
  const templateName = (id: string, version: string) => templates.data?.find((item) => item.templateId === id && item.version === version)?.name ?? id;
  return <div className="space-y-7"><PageHeader eyebrow="Workspace" title="Documents" description="Create, update, and generate private documents from versioned templates." actions={<Button asChild><Link to="/documents/new"><FilePlus2 />Create document</Link></Button>} />
    {documents.isPending ? <PageLoading /> : documents.isError ? <Alert variant="destructive"><AlertTitle>Documents unavailable</AlertTitle><AlertDescription>{errorMessage(documents.error)}</AlertDescription></Alert> : !documents.data.length ? <Card className="border-dashed bg-muted/20"><CardContent className="flex flex-col items-center px-6 py-16 text-center"><span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Files className="size-7" /></span><h2 className="mt-5 text-lg font-semibold">No documents yet</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">Create your first document from one of the available templates.</p><Button asChild className="mt-6"><Link to="/documents/new"><FilePlus2 />Create your first document</Link></Button></CardContent></Card> : <><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{active}</span> active · {documents.data.length - active} archived</p><div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex"><ShieldCheck className="size-4 text-emerald-600" />Saved in your vault</div></div>
      <Card className="hidden overflow-hidden py-0 md:block"><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Status</TableHead><TableHead>Revision</TableHead><TableHead>Last updated</TableHead><TableHead className="w-40"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{documents.data.map((item) => <TableRow key={item.id} className={item.archived ? "opacity-65" : ""}><TableCell><Link to={`/documents/${item.id}/edit`} className="font-medium hover:text-primary hover:underline">{item.label}</Link><p className="mt-1 text-xs text-muted-foreground">{templateName(item.templateId, item.templateVersion)}</p></TableCell><TableCell><Badge variant={item.archived ? "secondary" : "outline"}>{item.archived ? "Archived" : "Active"}</Badge></TableCell><TableCell>Revision {item.currentRevision}</TableCell><TableCell className="text-muted-foreground">{prettyDate(item.updatedAt)}</TableCell><TableCell><RecordActions record={item} /></TableCell></TableRow>)}</TableBody></Table></Card>
      <div className="grid gap-3 md:hidden">{documents.data.map((item) => <Card key={item.id} className={item.archived ? "opacity-70" : ""}><CardContent className="space-y-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{item.label}</h2><p className="mt-1 text-xs text-muted-foreground">{templateName(item.templateId, item.templateVersion)} · Revision {item.currentRevision}</p></div><Badge variant={item.archived ? "secondary" : "outline"}>{item.archived ? "Archived" : "Active"}</Badge></div><RecordActions record={item} compact /></CardContent></Card>)}</div></>}
    <Outlet />
  </div>;
}
