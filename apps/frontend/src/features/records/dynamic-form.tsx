import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentTemplate, FieldUi, JsonObject } from "@/lib/domain";

function DynamicField({ field, template, value, onChange, disabled }: { field: FieldUi; template: DocumentTemplate; value: JsonObject; onChange: (value: JsonObject) => void; disabled?: boolean }) {
  const schema = template.schema.properties?.[field.path] ?? {};
  const required = template.schema.required?.includes(field.path) ?? false;
  const current = value[field.path];
  const id = `field-${field.path}`;
  const update = (next: unknown) => onChange({ ...value, [field.path]: next });
  const label = field.label ?? field.path;
  if (field.input === "boolean") return <div className="flex items-start gap-3 rounded-xl border bg-muted/20 p-4"><Checkbox id={id} checked={Boolean(current)} onCheckedChange={(next) => update(next === true)} disabled={disabled} /><div><Label htmlFor={id}>{label}</Label>{field.placeholder && <p className="mt-1 text-sm text-muted-foreground">{field.placeholder}</p>}</div></div>;
  if (field.input === "multiline") return <Field className="sm:col-span-2"><FieldLabel htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</FieldLabel><Textarea id={id} rows={4} value={String(current ?? "")} maxLength={schema.maxLength} required={required} disabled={disabled} placeholder={field.placeholder} onChange={(event) => update(event.target.value)} /></Field>;
  if (field.input === "enum" || schema.enum) return <Field><FieldLabel htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</FieldLabel><Select value={String(current ?? "")} onValueChange={update} disabled={disabled}><SelectTrigger id={id} className="h-10 w-full"><SelectValue placeholder="Select an option" /></SelectTrigger><SelectContent>{schema.enum?.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectContent></Select></Field>;
  const type = field.input === "date" ? "date" : field.input === "money" || field.input === "number" ? "number" : field.input === "email" ? "email" : field.input === "url" ? "url" : field.input === "secret" ? "password" : "text";
  return <Field><FieldLabel htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</FieldLabel><Input id={id} type={type} className="h-10" value={String(current ?? "")} required={required} disabled={disabled} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} maxLength={schema.maxLength} placeholder={field.placeholder} onChange={(event) => update(type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} />{field.input === "secret" && <FieldDescription>Sensitive values stay private in your profile vault.</FieldDescription>}</Field>;
}

export function DynamicForm({ template, value, onChange, disabled }: { template: DocumentTemplate; value: JsonObject; onChange: (value: JsonObject) => void; disabled?: boolean }) {
  return <div className="space-y-4">{template.ui.sections.map((section) => <FieldSet key={section.title} disabled={disabled} className="rounded-xl border bg-card p-5 shadow-sm"><FieldLegend className="px-1 text-lg">{section.title}</FieldLegend><div className="grid gap-5 sm:grid-cols-2">{section.fields.map((field) => <DynamicField key={field.path} field={field} template={template} value={value} onChange={onChange} disabled={disabled} />)}</div></FieldSet>)}</div>;
}
