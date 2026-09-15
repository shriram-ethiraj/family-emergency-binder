import { useMutation } from "@tanstack/react-query";
import { Archive, Copy, Ellipsis, FileDown, History, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, errorMessage, json } from "@/lib/api";
import type { DocumentDetail, DocumentSummary } from "@/lib/domain";
import { queryClient, queryKeys } from "@/lib/query-client";
import { DeleteRecordDialog } from "./delete-record-dialog";

export function RecordActions({ record, compact = false }: { record: DocumentSummary; compact?: boolean }) {
  const navigate = useNavigate();
  const archive = useMutation({
    mutationFn: () => api(`/documents/${record.id}/archive`, json("POST", { archived: !record.archived })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success(record.archived ? "Document restored" : "Document archived");
    },
    onError: (error) => toast.error(errorMessage(error))
  });
  const clone = useMutation({
    mutationFn: () => api<DocumentDetail>(`/documents/${record.id}/clone`, json("POST", {})),
    onSuccess: async (copied) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      toast.success("Document copied");
      navigate(`/documents/${copied.id}/edit`);
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm"><Link to={`/documents/${record.id}/edit`}><Pencil />Edit</Link></Button>
        <Button asChild variant="outline" size="sm"><Link to={`/documents/${record.id}/revisions`} state={{ routeOverlay: true }}><History />Revisions</Link></Button>
        <Button asChild size="sm" disabled={record.archived}><Link to={`/documents/${record.id}/generate`} state={{ routeOverlay: true }}><FileDown />Generate PDF</Link></Button>
        <Button variant="outline" size="sm" disabled={clone.isPending} onClick={() => clone.mutate()}>
          <Copy />{clone.isPending ? "Copying…" : "Copy"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      {!record.archived && <Button asChild size="sm"><Link to={`/documents/${record.id}/generate`} state={{ routeOverlay: true }}><FileDown />Generate PDF</Link></Button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${record.label}`}><Ellipsis /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem asChild><Link to={`/documents/${record.id}/edit`}><Pencil />Edit document</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link to={`/documents/${record.id}/revisions`} state={{ routeOverlay: true }}><History />Revision history</Link></DropdownMenuItem>
          <DropdownMenuItem disabled={clone.isPending} onSelect={() => clone.mutate()}><Copy />{clone.isPending ? "Copying…" : "Copy document"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={archive.isPending} onSelect={() => archive.mutate()}>{record.archived ? <RotateCcw /> : <Archive />}{record.archived ? "Restore document" : "Archive document"}</DropdownMenuItem>
          {record.archived && <DeleteRecordDialog record={record} trigger={<DropdownMenuItem variant="destructive" onSelect={(event) => event.preventDefault()}><Trash2 />Delete permanently</DropdownMenuItem>} />}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
