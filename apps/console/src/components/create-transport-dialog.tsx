'use client';

import { ArrowLeft, Copy, Loader2, Plus, Search, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '../lib/app-context';
import { useAllTransports, useCreateTransport, type TransportWithApp } from '../lib/hooks';
import {
  TRANSPORT_TEMPLATES,
  initialValues,
  type TransportTemplate,
} from '../lib/transport-templates';
import {
  CreditUnitType,
  type CreateTransport,
  type ValidationAddress,
  type ValidationContent,
} from '../lib/types';
import { cn } from '../lib/utils';
import { JsonEditor } from './json-editor';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { ErrorNotice, StatusBadge } from './ui/feedback';
import { Input } from './ui/input';
import { Field } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type Draft = {
  /** Where this draft came from, for the step-2 heading. */
  source: { kind: 'template'; template: TransportTemplate } | { kind: 'copy'; from: TransportWithApp };
  name: string;
  values: Record<string, string>;
  config: Record<string, unknown> | null;
};

function draftFromTemplate(template: TransportTemplate): Draft {
  const values = initialValues(template);
  return {
    source: { kind: 'template', template },
    name: template.suggestedName,
    values,
    config: template.build(values),
  };
}

function draftFromExisting(transport: TransportWithApp): Draft {
  return {
    source: { kind: 'copy', from: transport },
    name: transport.name,
    values: {},
    // Copy the working config verbatim — same provider, same credentials.
    config: transport.config as Record<string, unknown>,
  };
}

function TemplatePicker({ onPick }: { onPick: (draft: Draft) => void }) {
  const { appId } = useApp();
  const { data: existing, isLoading } = useAllTransports();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();

  const templates = TRANSPORT_TEMPLATES.filter(
    (t) =>
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );

  // Only transports from *other* apps are worth copying; this app's own are
  // already visible in the table behind the dialog.
  const reusable = useMemo(
    () =>
      (existing ?? [])
        .filter((t) => t.appCuid !== appId)
        .filter(
          (t) =>
            !q ||
            t.name.toLowerCase().includes(q) ||
            t.appName.toLowerCase().includes(q) ||
            t.type.toLowerCase().includes(q),
        ),
    [existing, appId, q],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search providers and existing transports…"
          aria-label="Search templates"
          className="pl-9"
        />
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5" /> Provider templates
        </h3>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No providers match that search.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => onPick(draftFromTemplate(template))}
                className="rounded-md border p-3 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{template.name}</span>
                  <Badge variant="outline">{template.type}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {template.description}
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Copy className="size-3.5" /> Copy from another application
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading existing transports…</p>
        ) : reusable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No transports configured in other applications yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {reusable.map((transport) => (
              <button
                key={`${transport.appCuid}-${transport.cuid}`}
                type="button"
                onClick={() => onPick(draftFromExisting(transport))}
                className="flex items-center justify-between gap-3 rounded-md border p-2.5 text-left transition-colors hover:border-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {transport.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    from {transport.appName}
                  </span>
                </span>
                <StatusBadge status={transport.type} />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DraftForm({
  draft,
  setDraft,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
}) {
  const template = draft.source.kind === 'template' ? draft.source.template : null;
  const [showJson, setShowJson] = useState(draft.source.kind === 'copy');

  const setValue = (key: string, value: string) => {
    const values = { ...draft.values, [key]: value };
    setDraft({
      ...draft,
      values,
      // Field edits regenerate the config from the template blueprint.
      config: template ? template.build(values) : draft.config,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Transport name" htmlFor="t-name" hint="How it appears in this app.">
        <Input
          id="t-name"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          required
        />
      </Field>

      {template?.fields.map((field) =>
        field.type === 'boolean' ? (
          <label key={field.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={draft.values[field.key] === 'true'}
              onChange={(e) => setValue(field.key, String(e.target.checked))}
            />
            {field.label}
          </label>
        ) : (
          <Field
            key={field.key}
            label={field.label + (field.required ? ' *' : '')}
            htmlFor={`f-${field.key}`}
            hint={field.hint}
          >
            <Input
              id={`f-${field.key}`}
              type={field.type === 'password' ? 'password' : field.type}
              value={draft.values[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              autoComplete={field.type === 'password' ? 'new-password' : 'off'}
            />
          </Field>
        ),
      )}

      {draft.source.kind === 'copy' ? (
        <p className="rounded-md bg-muted p-2.5 text-xs text-muted-foreground">
          Copied from <strong>{draft.source.from.name}</strong> in{' '}
          {draft.source.from.appName}, including its credentials. Review the JSON below
          before saving.
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => setShowJson((s) => !s)}
        >
          {showJson ? 'Hide' : 'Show'} generated config (JSON)
        </Button>
        {showJson ? (
          <div className="mt-2">
            <JsonEditor
              value={draft.config ?? {}}
              rows={10}
              onChange={(parsed) =>
                setDraft({
                  ...draft,
                  config: parsed === null ? null : (parsed as Record<string, unknown>),
                })
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function CreateTransportDialog() {
  const create = useCreateTransport();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [withPricing, setWithPricing] = useState(false);
  const [creditPerUnit, setCreditPerUnit] = useState('1');
  const [unitType, setUnitType] = useState<CreditUnitType>(CreditUnitType.MESSAGE);
  const [currency, setCurrency] = useState('USD');

  const pick = (next: Draft) => {
    setDraft(next);
    // Templates that declare pricing pre-fill and pre-enable it.
    const templatePricing =
      next.source.kind === 'template' ? next.source.template.pricing : undefined;
    if (templatePricing) {
      setWithPricing(true);
      setCreditPerUnit(String(templatePricing.creditPerUnit));
      setUnitType(templatePricing.unitType);
      setCurrency(templatePricing.currency ?? 'USD');
    } else {
      setWithPricing(false);
    }
  };

  const reset = () => {
    setDraft(null);
    setWithPricing(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

  const missingRequired =
    draft?.source.kind === 'template' &&
    draft.source.template.fields.some(
      (f) => f.required && !String(draft.values[f.key] ?? '').trim(),
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft?.config || missingRequired) return;

    const template = draft.source.kind === 'template' ? draft.source.template : null;
    const from = draft.source.kind === 'copy' ? draft.source.from : null;

    const body: CreateTransport = {
      name: draft.name.trim(),
      type: template?.type ?? (from?.type as CreateTransport['type']),
      config: draft.config,
      ...(template?.validationAddress ?? from?.validationAddress
        ? {
            validationAddress: (template?.validationAddress ??
              from?.validationAddress) as ValidationAddress,
          }
        : {}),
      ...(template?.validationContent ?? from?.validationContent
        ? {
            validationContent: (template?.validationContent ??
              from?.validationContent) as ValidationContent,
          }
        : {}),
      ...(withPricing
        ? {
            pricing: {
              creditPerUnit: Number(creditPerUnit),
              unitType,
              currency: currency.trim() || 'USD',
            },
          }
        : {}),
    };

    await create.mutateAsync(body);
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> New transport
        </Button>
      </DialogTrigger>

      <DialogContent className={cn(draft ? 'max-w-2xl' : 'max-w-3xl')}>
        <DialogHeader>
          <DialogTitle>
            {draft
              ? draft.source.kind === 'template'
                ? `Set up ${draft.source.template.name}`
                : `Copy ${draft.source.from.name}`
              : 'Add a transport'}
          </DialogTitle>
          <DialogDescription>
            {draft
              ? 'Only the parts that differ between applications need filling in.'
              : 'Start from a provider template, or reuse a transport already configured in another application.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {draft ? (
            <form id="create-transport" onSubmit={submit} className="flex flex-col gap-4">
              <ErrorNotice error={create.error} />
              <DraftForm draft={draft} setDraft={setDraft} />

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={withPricing}
                  onChange={(e) => setWithPricing(e.target.checked)}
                />
                Set pricing
              </label>

              {withPricing ? (
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Credit per unit" htmlFor="t-credit">
                    <Input
                      id="t-credit"
                      type="number"
                      step="0.0001"
                      min="0"
                      value={creditPerUnit}
                      onChange={(e) => setCreditPerUnit(e.target.value)}
                    />
                  </Field>
                  <Field label="Unit type">
                    <Select
                      value={unitType}
                      onValueChange={(v) => setUnitType(v as CreditUnitType)}
                    >
                      <SelectTrigger aria-label="Unit type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.values(CreditUnitType).map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Currency" htmlFor="t-currency">
                    <Input
                      id="t-currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
            </form>
          ) : (
            <TemplatePicker onPick={pick} />
          )}
        </DialogBody>

        <DialogFooter>
          {draft ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="mr-auto"
                onClick={reset}
              >
                <ArrowLeft /> Back to templates
              </Button>
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                form="create-transport"
                disabled={
                  create.isPending ||
                  !draft.name.trim() ||
                  !draft.config ||
                  missingRequired
                }
              >
                {create.isPending ? <Loader2 className="animate-spin" /> : null}
                Create transport
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
