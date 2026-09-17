import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentTemplate, FieldUi, JsonObject } from "@/lib/domain";

function DynamicField({ field, template, value, onChange, disabled, invalid }: { field: FieldUi; template: DocumentTemplate; value: JsonObject; onChange: (value: JsonObject) => void; disabled?: boolean; invalid?: boolean }) {
  const schema = template.schema.properties?.[field.path] ?? {};
  const required = template.schema.required?.includes(field.path) ?? false;
  const current = value[field.path];
  const id = `field-${field.path}`;
  const update = (next: unknown) => onChange({ ...value, [field.path]: next });
  const label = field.label ?? field.path;
  const error = invalid ? <FieldError errors={[{ message: `${label} is required` }]} /> : null;
  if (field.input === "boolean") return <div className={`flex items-start gap-3 rounded-xl border bg-muted/20 p-4${invalid ? " border-destructive" : ""}`}><Checkbox id={id} aria-invalid={invalid} checked={Boolean(current)} onCheckedChange={(next) => update(next === true)} disabled={disabled} /><div><Label htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</Label>{field.placeholder && <p className="mt-1 text-sm text-muted-foreground">{field.placeholder}</p>}{error}</div></div>;
  if (field.input === "multiline") return <Field className="sm:col-span-2" data-invalid={invalid}><FieldLabel htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</FieldLabel><Textarea id={id} aria-invalid={invalid} rows={4} value={String(current ?? "")} maxLength={schema.maxLength} required={required} disabled={disabled} placeholder={field.placeholder} onChange={(event) => update(event.target.value)} />{error}</Field>;
  if (field.input === "enum" || schema.enum) return <Field data-invalid={invalid}><FieldLabel htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</FieldLabel><Select key={String(current ?? "")} value={String(current ?? "")} onValueChange={update} disabled={disabled}><SelectTrigger id={id} aria-invalid={invalid} className="h-10 w-full"><SelectValue placeholder="Select an option" /></SelectTrigger><SelectContent>{schema.enum?.map((option) => <SelectItem value={option} key={option}>{option}</SelectItem>)}</SelectContent></Select>{error}</Field>;
  const type = field.input === "date" ? "date" : field.input === "money" || field.input === "number" ? "number" : field.input === "email" ? "email" : field.input === "url" ? "url" : field.input === "secret" ? "password" : "text";
  return <Field data-invalid={invalid}><FieldLabel htmlFor={id}>{label}{required && <span className="text-destructive">*</span>}</FieldLabel><Input id={id} aria-invalid={invalid} type={type} className="h-10" value={String(current ?? "")} required={required} disabled={disabled} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} maxLength={schema.maxLength} placeholder={field.placeholder} onChange={(event) => update(type === "number" ? (event.target.value === "" ? "" : Number(event.target.value)) : event.target.value)} />{field.input === "secret" && <FieldDescription>Sensitive values stay private in your profile vault.</FieldDescription>}{error}</Field>;
}

export function DynamicForm({ template, value, onChange, disabled, invalidFields }: { template: DocumentTemplate; value: JsonObject; onChange: (value: JsonObject) => void; disabled?: boolean; invalidFields?: Set<string> }) {
  return <div className="space-y-4">{template.ui.sections.map((section) => <FieldSet key={section.title} disabled={disabled} className="rounded-xl border bg-card p-5 shadow-sm"><FieldLegend className="px-1 text-lg">{section.title}</FieldLegend><div className="grid gap-5 sm:grid-cols-2">{section.fields.map((field) => <DynamicField key={field.path} field={field} template={template} value={value} onChange={onChange} disabled={disabled} invalid={invalidFields?.has(field.path)} />)}</div></FieldSet>)}</div>;
}
