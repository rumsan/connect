'use client';

import { Loader2, Plus, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDestructive } from '../../../../../components/ui/alert-dialog';
import { Button } from '../../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../../components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../../../components/ui/dialog';
import {
  CopyId,
  Empty,
  ErrorNotice,
  PageHead,
  StatusBadge,
  SuccessNotice,
  formatDate,
} from '../../../../../components/ui/feedback';
import { Input, Textarea } from '../../../../../components/ui/input';
import { Field } from '../../../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../../components/ui/select';
import { TableSkeleton } from '../../../../../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../../components/ui/table';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useSyncTemplates,
  useTemplates,
  useTransports,
} from '../../../../../lib/hooks';
import { TemplateStatus, TemplateType } from '../../../../../lib/types';

const ALL = '__all__';

function CreateTemplateDialog() {
  const create = useCreateTemplate();
  const { data: transportData } = useTransports();
  const transports = transportData?.data ?? [];

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [transport, setTransport] = useState('');
  const [type, setType] = useState<TemplateType>(TemplateType.TEXT);
  const [language, setLanguage] = useState('en');
  const [body, setBody] = useState('');
  const [media, setMedia] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await create.mutateAsync({
      name: name.trim(),
      transport,
      type,
      language: language.trim() || 'en',
      body: body.trim(),
      ...(type === TemplateType.MEDIA && media.trim()
        ? { media: media.split(/[\n,]+/).map((m) => m.trim()).filter(Boolean) }
        : {}),
    });
    setOpen(false);
    setName('');
    setBody('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create template</DialogTitle>
          <DialogDescription>
            Providers like WhatsApp require message bodies to be registered up front.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="create-template" className="flex flex-col gap-4" onSubmit={submit}>
            <ErrorNotice error={create.error} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Name"
                htmlFor="tpl-name"
                hint="Provider names are usually lowercase with underscores."
              >
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="payment_approved"
                  required
                />
              </Field>
              <Field label="Transport">
                <Select value={transport} onValueChange={setTransport}>
                  <SelectTrigger aria-label="Transport">
                    <SelectValue placeholder="Select a transport" />
                  </SelectTrigger>
                  <SelectContent>
                    {transports.map((t) => (
                      <SelectItem key={t.cuid} value={t.cuid}>
                        {t.name} ({t.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Type">
                <Select value={type} onValueChange={(v) => setType(v as TemplateType)}>
                  <SelectTrigger aria-label="Template type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(TemplateType).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Language" htmlFor="tpl-lang">
                <Input
                  id="tpl-lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                />
              </Field>
            </div>

            <Field
              label="Body"
              htmlFor="tpl-body"
              hint="Positional variables use the provider's syntax, e.g. Hello {{1}}."
            >
              <Textarea
                id="tpl-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hello {{1}}, your transfer of {{2}} has been approved."
                required
              />
            </Field>

            {type === TemplateType.MEDIA ? (
              <Field label="Media URLs" htmlFor="tpl-media" hint="One per line.">
                <Textarea
                  id="tpl-media"
                  value={media}
                  onChange={(e) => setMedia(e.target.value)}
                  placeholder="https://example.org/receipt.png"
                />
              </Field>
            ) : null}
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-template"
            disabled={create.isPending || !name.trim() || !transport || !body.trim()}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SyncPanel() {
  const { data: transportData } = useTransports();
  const sync = useSyncTemplates();
  const transports = transportData?.data ?? [];
  const [transport, setTransport] = useState('');

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Sync from provider</CardTitle>
          <CardDescription>
            Pull the transport&apos;s approved template catalogue into Connect.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ErrorNotice error={sync.error} />
        {sync.isSuccess ? <SuccessNotice>Templates synced.</SuccessNotice> : null}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={transport} onValueChange={setTransport}>
            <SelectTrigger className="w-64" aria-label="Transport to sync">
              <SelectValue placeholder="Select a transport" />
            </SelectTrigger>
            <SelectContent>
              {transports.map((t) => (
                <SelectItem key={t.cuid} value={t.cuid}>
                  {t.name} ({t.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            disabled={!transport || sync.isPending}
            onClick={() => sync.mutate(transport)}
          >
            {sync.isPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Sync now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplatesPage() {
  const [status, setStatus] = useState<string>(ALL);
  const { data, isLoading, error } = useTemplates(status !== ALL ? { status } : {});
  const remove = useDeleteTemplate();
  const templates = data?.data ?? [];

  return (
    <>
      <PageHead
        title="Templates"
        subtitle="Message templates registered with your channel providers."
        actions={<CreateTemplateDialog />}
      />

      <div className="flex flex-col gap-4">
        <SyncPanel />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Templates</CardTitle>
              <CardDescription>
                Pre-approved message bodies required by channels like WhatsApp.
              </CardDescription>
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {Object.values(TemplateStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>

          {isLoading ? (
            <TableSkeleton columns={8} />
          ) : error ? (
            <div className="p-4">
              <ErrorNotice error={error} />
            </div>
          ) : templates.length === 0 ? (
            <Empty
              title="No templates"
              hint="Create one, or sync an existing catalogue from the provider."
              action={<CreateTemplateDialog />}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Language</TableHead>
                  <TableHead>Template id</TableHead>
                  <TableHead>Body</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.cuid}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={template.status} />
                    </TableCell>
                    <TableCell>{template.type}</TableCell>
                    <TableCell>{template.language}</TableCell>
                    <TableCell>
                      <CopyId value={template.cuid} />
                    </TableCell>
                    <TableCell className="max-w-80 text-muted-foreground">
                      {template.body || '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(template.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ConfirmDestructive
                        title={`Deactivate "${template.name}"?`}
                        description="The template stays on record but can no longer be used for new broadcasts."
                        confirmLabel="Deactivate"
                        onConfirm={() => remove.mutate(template.cuid)}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={remove.isPending}
                        >
                          Deactivate
                        </Button>
                      </ConfirmDestructive>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
