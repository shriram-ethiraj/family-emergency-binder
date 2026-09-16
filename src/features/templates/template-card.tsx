import { Eye, FilePlus2 } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentTemplate } from "@/lib/domain";
import { previewTemplate } from "@/lib/pdf";
import { errorMessage } from "@/lib/api";
import { toast } from "sonner";

export function TemplateCard({ template, selectHref }: { template: DocumentTemplate; selectHref?: string }) {
  const preview = async () => { try { await previewTemplate(template as import("@/lib/domain").PdfTemplate); toast.success("Preview opened in a new tab"); } catch (error) { if ((error as DOMException).name !== "AbortError") toast.error(errorMessage(error)); } };
  return <Card className="overflow-hidden py-0"><div className="aspect-[4/3] overflow-hidden border-b bg-muted"><img src={template.thumbnailUrl} alt={`Preview of ${template.name}`} className="h-full w-full object-cover object-top" /></div><CardContent className="flex min-h-52 flex-col p-5"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{template.page.size}</Badge><Badge variant="outline">Version {template.version}</Badge></div><h2 className="mt-3 text-base font-semibold">{template.name}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{template.description}</p><div className="mt-auto flex flex-wrap gap-2 pt-5">{selectHref && <Button asChild size="sm"><Link to={selectHref}><FilePlus2 />Use template</Link></Button>}<Button variant="outline" size="sm" onClick={() => void preview()}><Eye />Preview</Button></div></CardContent></Card>;
}
