import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, FileDown, LoaderCircle, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { z } from "zod";
import { useSession } from "@/app/session-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { savePdf } from "@/lib/pdf";
import type { PdfTemplate } from "@/lib/domain";
import type { DocumentDetail, DocumentRevision } from "@/lib/domain";
import { vaultClient } from "@/lib/vault-client";
import { useDocument, useTemplate } from "./queries";

const schema = z.object({ password: z.string().min(1, "Enter a password for this PDF") });
type Values = z.infer<typeof schema>;

export function Component() {
  const { documentId = "" } = useParams(); const [params] = useSearchParams(); const navigate = useNavigate(); const { session } = useSession();
  const document = useDocument(documentId); const template = useTemplate(document.data?.templateId ?? "", document.data?.templateVersion ?? "");
  const requested = Number(params.get("revision")); const revision = Number.isInteger(requested) && requested > 0 && requested <= (document.data?.currentRevision ?? 0) ? requested : document.data?.currentRevision;
  const [savedName, setSavedName] = useState(""); const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { password: "" } });
  const close = () => navigate("/documents", { replace: true });
  const generate = form.handleSubmit(async ({ password }) => {
    if (!document.data || !template.data || !revision) return;
    try {
      let selected: DocumentRevision = document.data.revision;
      if (revision !== selected.revision) selected = (await vaultClient.call<DocumentDetail>(`/documents/${documentId}`, "GET", { search: `revision=${revision}` })).revision;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
      const filename = await savePdf(template.data as PdfTemplate, { document: selected.data, system: { generatedAt: new Date().toISOString(), documentRevision: selected.revision, profileRevision: session?.profileRevision ?? 1 } }, password, `${session?.profileName ?? "family"}-${document.data.label}-${stamp}.pdf`, true);
      form.reset(); setSavedName(filename);
    } catch (error) { if ((error as DOMException).name !== "AbortError") form.setError("root", { message: errorMessage(error) }); }
  });
  const loading = document.isPending || template.isPending;
  return <Dialog open onOpenChange={(open) => { if (!open) close(); }}><DialogContent className="sm:max-w-lg">{savedName ? <><DialogHeader><span className="mb-2 grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="size-6" /></span><DialogTitle>PDF saved</DialogTitle><DialogDescription>The PDF is protected with the separate password you entered. The app keeps no copy or history of it.</DialogDescription></DialogHeader><div className="rounded-xl border bg-muted/50 p-4"><p className="break-all text-sm font-medium">{savedName}</p></div><DialogFooter><Button onClick={close}>Done</Button></DialogFooter></> : <form onSubmit={generate}><DialogHeader><DialogTitle className="flex items-center gap-2"><FileDown className="size-5 text-primary" />Create protected PDF</DialogTitle><DialogDescription>Choose a password used only for this generated file.</DialogDescription></DialogHeader>{loading ? <div className="my-6 h-32 animate-pulse rounded-xl bg-muted" /> : document.isError || !document.data || !template.data || !revision ? <Alert variant="destructive" className="my-5"><AlertTitle>Document cannot be generated</AlertTitle><AlertDescription>{document.isError ? errorMessage(document.error) : "The document revision or pinned template is unavailable."}</AlertDescription></Alert> : <><dl className="my-5 divide-y rounded-xl border bg-card px-4 text-sm"><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Document</dt><dd className="font-medium">{document.data.label}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Revision</dt><dd>{revision}</dd></div><div className="flex justify-between gap-4 py-3"><dt className="text-muted-foreground">Template</dt><dd>{template.data.name}</dd></div></dl><Alert className="mb-5"><ShieldAlert /><AlertTitle>Separate password</AlertTitle><AlertDescription>This password is not your vault password and is not stored anywhere by the app.</AlertDescription></Alert><Field data-invalid={Boolean(form.formState.errors.password)}><FieldLabel htmlFor="generation-password">PDF password</FieldLabel><Input id="generation-password" type="password" autoComplete="new-password" {...form.register("password")} /><FieldError errors={[form.formState.errors.password]} /></Field>{form.formState.errors.root && <p className="mt-3 text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>}</>}<DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={close}>Cancel</Button><Button disabled={loading || form.formState.isSubmitting || !template.data}>{form.formState.isSubmitting ? <><LoaderCircle className="animate-spin" />Generating…</> : "Choose location and generate"}</Button></DialogFooter></form>}</DialogContent></Dialog>;
}
