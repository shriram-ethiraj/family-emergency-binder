import { useMutation, useQuery } from "@tanstack/react-query";
import { FileClock, FileText, LoaderCircle, Trash2 } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { toast } from "sonner";
import { PageLoading } from "@/components/shared/loading";
import { PageHeader } from "@/components/shared/page-header";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage, json } from "@/lib/api";
import type { Generation } from "@/lib/domain";
import { prettyDate } from "@/lib/format";
import { queryClient, queryKeys } from "@/lib/query-client";

function RemoveGenerationDialog({ generation }: { generation: Generation }) {
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/generations/${generation.id}`, json("DELETE", {})),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.generations });
      toast.success("Removed from generated PDFs");
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Remove ${generation.filename} from list`}
          title="Remove from list"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {remove.isPending ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <AlertDialogHeader>
          <AlertDialogMedia className="text-destructive"><Trash2 /></AlertDialogMedia>
          <AlertDialogTitle>Remove PDF from list?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes only the entry from the Generated PDFs list. The protected PDF file will remain on disk.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              event.stopPropagation();
              remove.mutate();
            }}
          >
            {remove.isPending ? <><LoaderCircle className="animate-spin" />Removing…</> : "Remove from list"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function Component() {
  const query = useQuery({
    queryKey: queryKeys.generations,
    queryFn: async () => (await api<{ generations: Generation[] }>("/generations")).generations
  });
  const openDocument = (id: string) => window.open(`/api/outputs/${id}`, "_blank", "noopener,noreferrer");
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest("button, a, input, select, textarea, [role=\"button\"]"));
  const handleClick = (event: MouseEvent<HTMLElement>, id: string) => {
    if (!isInteractiveTarget(event.target)) openDocument(id);
  };
  const handleKey = (event: KeyboardEvent<HTMLElement>, id: string) => {
    if (!isInteractiveTarget(event.target) && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      openDocument(id);
    }
  };

  if (query.isPending) return <PageLoading />;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="File history"
        title="Generated PDFs"
        description="Open previously generated PDFs and verify which document revision and password epoch each file used."
      />
      {query.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Files unavailable</AlertTitle>
          <AlertDescription>{errorMessage(query.error)}</AlertDescription>
        </Alert>
      ) : !query.data.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileClock className="size-7" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">No generated PDFs</h2>
            <p className="mt-2 text-sm text-muted-foreground">Protected PDFs and their audit receipts will appear here.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Document revision</TableHead>
                  <TableHead>Password epoch</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="w-12"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.map((item) => (
                  <TableRow
                    key={item.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${item.filename}`}
                    className="cursor-pointer"
                    onClick={(event) => handleClick(event, item.id)}
                    onKeyDown={(event) => handleKey(event, item.id)}
                  >
                    <TableCell className="max-w-sm">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                          <FileText className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.filename}</p>
                          <p className="mt-1 font-mono text-xs text-muted-foreground">SHA-256 {item.outputHash.slice(0, 18)}…</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{item.documentRevision}</TableCell>
                    <TableCell>{item.passwordEpoch}</TableCell>
                    <TableCell className="text-muted-foreground">{prettyDate(item.generatedAt)}</TableCell>
                    <TableCell className="text-right"><RemoveGenerationDialog generation={item} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <div className="grid gap-3 md:hidden">
            {query.data.map((item) => (
              <Card
                key={item.id}
                role="link"
                tabIndex={0}
                aria-label={`Open ${item.filename}`}
                className="cursor-pointer"
                onClick={(event) => handleClick(event, item.id)}
                onKeyDown={(event) => handleKey(event, item.id)}
              >
                <CardContent>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 items-center place-items-center rounded-2xl bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                      <FileText className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="break-all text-sm font-semibold">{item.filename}</h2>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Document revision {item.documentRevision} · Password epoch {item.passwordEpoch}<br />
                        {prettyDate(item.generatedAt)}
                      </p>
                    </div>
                    <RemoveGenerationDialog generation={item} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
