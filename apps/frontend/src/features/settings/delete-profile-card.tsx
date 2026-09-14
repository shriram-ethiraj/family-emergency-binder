import { useMutation } from "@tanstack/react-query";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useSession } from "@/app/session-context";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage, json } from "@/lib/api";
import { queryClient, queryKeys } from "@/lib/query-client";

export function DeleteProfileCard() {
  const { session, clearSession } = useSession();
  const [open, setOpen] = useState(false); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [error, setError] = useState("");
  const profileName = session?.profile.fullName || session?.profileName || "this profile";
  const remove = useMutation({
    mutationFn: () => api<{ deleted: true }>("/profile", json("DELETE", { password })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.profiles });
      toast.success("Profile permanently deleted");
      setOpen(false);
      clearSession("deleted");
    },
    onError: (cause) => setError(errorMessage(cause)),
  });
  const close = (next: boolean) => { setOpen(next); if (!next) { setPassword(""); setConfirmation(""); setError(""); } };

  return <Card className="border border-destructive/40"><CardHeader><span className="mb-1 grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><Trash2 className="size-5" /></span><CardTitle>Delete profile</CardTitle><CardDescription>Permanently remove this profile and every record stored in its vault.</CardDescription></CardHeader><CardContent><AlertDialog open={open} onOpenChange={close}><AlertDialogTrigger asChild><Button variant="destructive"><Trash2 />Delete profile</Button></AlertDialogTrigger><AlertDialogContent><form onSubmit={(event) => { event.preventDefault(); remove.mutate(); }}><AlertDialogHeader><AlertDialogMedia className="text-destructive"><Trash2 /></AlertDialogMedia><AlertDialogTitle>Delete {profileName}?</AlertDialogTitle><AlertDialogDescription>This permanently deletes profile details, documents, revisions, recovery information, and audit history stored in the vault. Generated PDFs already saved outside the vault will remain on disk.</AlertDialogDescription></AlertDialogHeader><div className="mt-5 space-y-4"><Field><FieldLabel htmlFor="delete-profile-name">Type {profileName} to confirm</FieldLabel><Input id="delete-profile-name" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></Field><Field><FieldLabel htmlFor="delete-profile-password">Confirm profile password</FieldLabel><Input id="delete-profile-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></Field>{error && <p className="text-sm text-destructive" role="alert">{error}</p>}</div><AlertDialogFooter className="mt-5"><AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel><Button type="submit" variant="destructive" disabled={confirmation !== profileName || !password || remove.isPending}>{remove.isPending ? <><LoaderCircle className="animate-spin" />Deleting…</> : "Delete permanently"}</Button></AlertDialogFooter></form></AlertDialogContent></AlertDialog></CardContent></Card>;
}
