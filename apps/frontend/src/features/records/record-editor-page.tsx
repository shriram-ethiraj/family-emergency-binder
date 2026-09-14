import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FileText, LoaderCircle, Save } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { PageLoading } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TemplateCard } from "@/features/templates/template-card";
import { api, errorMessage, json } from "@/lib/api";
import type { JsonObject } from "@/lib/domain";
import { queryClient, queryKeys } from "@/lib/query-client";
import { DynamicForm } from "./dynamic-form";
import { useDocument, useTemplate, useTemplates } from "./queries";

const schema = z.object({ label: z.string().trim().min(1, "Enter a document label").max(100), data: z.record(z.string(), z.unknown()) });
type Values = z.infer<typeof schema>;

export function Component() {
  const { documentId } = useParams(); const creating = !documentId; const navigate = useNavigate(); const [params] = useSearchParams();
  const templates = useTemplates(); const document = useDocument(documentId ?? "");
  const templateId = creating ? params.get("template") ?? "" : document.data?.templateId ?? "";
  const templateVersion = creating ? params.get("version") ?? "" : document.data?.templateVersion ?? "";
  const template = useTemplate(templateId, templateVersion);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { label: "", data: {} } });
  useEffect(() => { if (document.data) form.reset({ label: document.data.label, data: document.data.revision.data }); }, [form, document.data]);
  const save = useMutation({
    mutationFn: (values: Values) => creating ? api("/documents", json("POST", { templateId, templateVersion, ...values })) : api(`/documents/${documentId}`, json("PUT", { expectedRevision: document.data?.currentRevision, ...values })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.documents }); if (documentId) await queryClient.invalidateQueries({ queryKey: queryKeys.document(documentId) }); toast.success(creating ? "Document created" : "Document saved as a new revision"); navigate("/documents"); },
    onError: (error) => form.setError("root", { message: errorMessage(error) }),
  });
  if (creating && !templateId) {
    if (templates.isPending) return <PageLoading />;
    return <div className="space-y-7"><PageHeader eyebrow="New document" title="Choose a template" description="Select the layout and fields for your new document." />{templates.isError ? <Alert variant="destructive"><AlertTitle>Templates unavailable</AlertTitle><AlertDescription>{errorMessage(templates.error)}</AlertDescription></Alert> : !templates.data?.length ? <Card className="border-dashed"><CardContent className="flex flex-col items-center py-16 text-center"><FileText className="size-8 text-muted-foreground" /><p className="mt-4">No templates are available.</p></CardContent></Card> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{templates.data.map((item) => <TemplateCard key={`${item.templateId}-${item.version}`} template={item} selectHref={`/documents/new?template=${item.templateId}&version=${item.version}`} />)}</div>}</div>;
  }
  if (template.isPending || (!creating && document.isPending)) return <PageLoading />;
  if (!template.data) return <Alert variant="destructive"><AlertTitle>Template unavailable</AlertTitle><AlertDescription>{template.isError ? errorMessage(template.error) : "The selected template version is unavailable."}</AlertDescription></Alert>;
  if (!creating && document.isError) return <Alert variant="destructive"><AlertTitle>Document unavailable</AlertTitle><AlertDescription>{errorMessage(document.error)}</AlertDescription></Alert>;
  const data = form.watch("data");
  return <form className="space-y-6 pb-24" onSubmit={form.handleSubmit((values) => save.mutate(values))} noValidate><PageHeader eyebrow={template.data.name} title={creating ? "Create document" : "Edit document"} description={creating ? template.data.description : "Saving creates a new immutable revision; earlier versions remain available."} actions={<div className="flex gap-2"><Badge variant="secondary">{template.data.page.size}</Badge>{!creating && document.data && <Badge variant="outline">Next revision {document.data.currentRevision + 1}</Badge>}</div>} />
    <Card><CardContent><Field data-invalid={Boolean(form.formState.errors.label)}><FieldLabel htmlFor="document-label">Document label</FieldLabel><Input id="document-label" className="h-10" placeholder="A name you will recognize later" {...form.register("label")} /><FieldError errors={[form.formState.errors.label]} /></Field></CardContent></Card>
    <DynamicForm template={template.data} value={data} onChange={(next: JsonObject) => form.setValue("data", next, { shouldDirty: true })} disabled={save.isPending} />
    {form.formState.errors.root && <Alert variant="destructive"><AlertTitle>Could not save</AlertTitle><AlertDescription>{form.formState.errors.root.message}</AlertDescription></Alert>}
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur md:left-[var(--sidebar-width)]"><div className="mx-auto flex max-w-7xl justify-end gap-2 px-2 sm:px-6"><Button asChild variant="outline"><Link to="/documents"><ArrowLeft />Cancel</Link></Button><Button type="submit" disabled={save.isPending}>{save.isPending ? <><LoaderCircle className="animate-spin" />Saving…</> : <><Save />{creating ? "Create document" : "Save new revision"}</>}</Button></div></div>
  </form>;
}
