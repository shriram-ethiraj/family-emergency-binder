import { FolderOpen, LoaderCircle } from "lucide-react";
import { useEffect, useRef, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useTemplateCatalog } from "@/app/template-context";

export function TemplateFolderPicker({ label = "Choose templates folder", className }: { label?: string; className?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const { choose, loading } = useTemplateCatalog();
  useEffect(() => { input.current?.setAttribute("webkitdirectory", ""); }, []);
  const changed = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    if (files.length) await choose(files);
    event.target.value = "";
  };
  return <>
    <input ref={input} type="file" multiple className="sr-only" aria-label="Template directory" onChange={(event) => void changed(event)} />
    <Button type="button" className={className} disabled={loading} onClick={() => input.current?.click()}>{loading ? <><LoaderCircle className="animate-spin" />Checking templates…</> : <><FolderOpen />{label}</>}</Button>
  </>;
}
