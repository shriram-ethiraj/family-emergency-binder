import { FileClock, FileDown } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/api";
import { prettyDate } from "@/lib/format";
import { useDocument, useRevisions } from "./queries";

export function Component() {
  const { documentId = "" } = useParams(); const navigate = useNavigate(); const location = useLocation(); const document = useDocument(documentId); const revisions = useRevisions(documentId);
  const close = () => location.state && (location.state as { routeOverlay?: boolean }).routeOverlay ? navigate(-1) : navigate("/documents", { replace: true });
  return <Sheet open onOpenChange={(open) => { if (!open) close(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle className="flex items-center gap-2"><FileClock className="size-5 text-primary" />Revision history</SheetTitle><SheetDescription>{document.data?.label ?? "Document"} · Every saved version remains available.</SheetDescription></SheetHeader><div className="space-y-3 px-4 pb-6">{revisions.isPending ? [1, 2, 3].map((item) => <Skeleton className="h-28 rounded-xl" key={item} />) : revisions.isError ? <Alert variant="destructive"><AlertTitle>History unavailable</AlertTitle><AlertDescription>{errorMessage(revisions.error)}</AlertDescription></Alert> : revisions.data?.map((revision, index) => { const older = revisions.data[index + 1]?.data ?? {}; const changed = Object.keys(revision.data).filter((key) => revision.data[key] !== older[key]); return <article className="rounded-xl border bg-card p-4" key={revision.revision}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">Revision {revision.revision}</h3><p className="mt-1 text-xs text-muted-foreground">{prettyDate(revision.createdAt)}</p></div>{index === 0 && <Badge>Current</Badge>}</div><p className="mt-3 text-sm text-muted-foreground">{index === revisions.data.length - 1 ? "Initial document" : `${changed.length} changed field${changed.length === 1 ? "" : "s"}${changed.length ? `: ${changed.join(", ")}` : ""}`}</p><details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">View saved values</summary><dl className="mt-3 grid gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">{Object.entries(revision.data).map(([key, value]) => <div className="min-w-0 border-b py-1 last:border-0" key={key}><dt className="text-xs text-muted-foreground">{key}</dt><dd className="break-words text-sm">{String(value || "—")}</dd></div>)}</dl></details><Button asChild variant="outline" size="sm" className="mt-4"><Link to={`/documents/${documentId}/generate?revision=${revision.revision}`} state={{ routeOverlay: true }} replace><FileDown />Generate this revision</Link></Button></article>; })}</div></SheetContent></Sheet>;
}
