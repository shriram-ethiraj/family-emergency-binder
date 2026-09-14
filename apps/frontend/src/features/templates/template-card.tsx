import { ExternalLink, FilePlus2 } from "lucide-react";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentTemplate } from "@/lib/domain";

export function TemplateCard({ template, selectHref }: { template: DocumentTemplate; selectHref?: string }) {
  const previewUrl = `/api/templates/${template.templateId}/${template.version}/preview`;
  return <Card className="overflow-hidden py-0"><div className="aspect-[4/3] overflow-hidden border-b bg-muted"><img src={template.thumbnailUrl} alt={`Preview of ${template.name}`} className="h-full w-full object-cover object-top" /></div><CardContent className="flex min-h-52 flex-col p-5"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{template.page.size}</Badge><Badge variant="outline">Version {template.version}</Badge></div><h2 className="mt-3 text-base font-semibold">{template.name}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{template.description}</p><div className="mt-auto flex flex-wrap gap-2 pt-5">{selectHref && <Button asChild size="sm"><Link to={selectHref}><FilePlus2 />Use template</Link></Button>}<Button asChild variant="outline" size="sm"><a href={previewUrl} target="_blank" rel="noreferrer"><ExternalLink />View sample preview</a></Button></div></CardContent></Card>;
}
