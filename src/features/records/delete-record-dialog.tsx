import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";
import type { DocumentSummary } from "@/lib/domain";
import { queryClient, queryKeys } from "@/lib/query-client";

export function DeleteRecordDialog({ record, trigger }: { record: DocumentSummary; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false); const [confirmation, setConfirmation] = useState("");
  const remove = useMutation({ mutationFn: () => api(`/documents/${record.id}`, json("DELETE", { confirmation })), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: queryKeys.documents }); toast.success("Document permanently deleted"); setOpen(false); }, onError: (error) => toast.error(errorMessage(error)) });
  return <AlertDialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setConfirmation(""); }}><AlertDialogTrigger asChild>{trigger ?? <Button variant="destructive" size="sm"><Trash2 />Delete permanently</Button>}</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogMedia className="text-destructive"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Delete every revision?</AlertDialogTitle><AlertDialogDescription>This cannot be undone. Type <strong className="text-foreground">{record.label}</strong> to delete this document and its complete revision history.</AlertDialogDescription></AlertDialogHeader><Field><FieldLabel htmlFor={`delete-${record.id}`}>Document name</FieldLabel><Input id={`delete-${record.id}`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><Button variant="destructive" disabled={confirmation !== record.label || remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting…" : "Delete permanently"}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}
