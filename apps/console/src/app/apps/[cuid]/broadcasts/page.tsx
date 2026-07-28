'use client';

import { Loader2, Send } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { JsonEditor } from '../../../../components/json-editor';
import { Button } from '../../../../components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import {
  ErrorNotice,
  PageHead,
  SuccessNotice,
} from '../../../../components/ui/feedback';
import { Input, Textarea } from '../../../../components/ui/input';
import { Field } from '../../../../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import { parseAddresses } from '../../../../lib/addresses';
import { appHref, useApp } from '../../../../lib/app-context';
import {
  useSendBroadcast,
  useTemplates,
  useTransports,
} from '../../../../lib/hooks';
import { TemplateStatus, TriggerType, type SendBroadcast } from '../../../../lib/types';

type MessageMode = 'content' | 'template';

export default function SendBroadcastPage() {
  const { appId } = useApp();
  const send = useSendBroadcast();
  const { data: transportData } = useTransports();
  const transports = useMemo(() => transportData?.data ?? [], [transportData]);

  const [transport, setTransport] = useState('');
  const [mode, setMode] = useState<MessageMode>('content');
  const [content, setContent] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [meta, setMeta] = useState<Record<string, unknown> | null>({});
  const [addressesRaw, setAddressesRaw] = useState('');
  const [trigger, setTrigger] = useState<TriggerType>(TriggerType.IMMEDIATE);
  const [scheduledAt, setScheduledAt] = useState('');
  const [maxAttempts, setMaxAttempts] = useState('3');
  const [attemptInterval, setAttemptInterval] = useState('60');
  const [webhook, setWebhook] = useState('');
  const [xref, setXref] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Templates are transport-scoped, and only approved ones can be sent.
  const { data: templateData } = useTemplates(transport ? { transportId: transport } : {});
  const templates = (templateData?.data ?? []).filter(
    (t) => t.status === TemplateStatus.APPROVED || t.isActive,
  );

  const addresses = parseAddresses(addressesRaw);
  const messageReady = mode === 'content' ? content.trim().length > 0 : Boolean(templateId);
  const canSend =
    Boolean(transport) && messageReady && addresses.length > 0 && meta !== null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    const payload: SendBroadcast = {
      transport,
      message:
        mode === 'content'
          ? { content: content.trim(), meta: meta ?? undefined }
          : { templateId, meta: meta ?? undefined },
      addresses,
      maxAttempts: Number(maxAttempts) || 1,
      trigger,
      ...(webhook.trim() ? { webhook: webhook.trim() } : {}),
      ...(xref.trim() ? { xref: xref.trim() } : {}),
      options: {
        ...(trigger === TriggerType.SCHEDULED && scheduledAt
          ? { scheduledTimestamp: new Date(scheduledAt).toISOString() }
          : {}),
        attemptIntervalMinutes: attemptInterval,
      },
    };

    const result = await send.mutateAsync(payload);
    // A broadcast create returns the session that fans out to each address.
    setSessionId((result as { cuid?: string })?.cuid ?? null);
    setAddressesRaw('');
    setContent('');
  };

  return (
    <>
      <PageHead
        title="Send broadcast"
        subtitle="Fan a message out to many addresses through one transport."
        actions={
          <Button variant="outline" asChild>
            <Link href={appHref(appId as string, 'sessions')}>View sessions</Link>
          </Button>
        }
      />

      <form className="flex flex-col gap-4" onSubmit={submit}>
        {sessionId ? (
          <SuccessNotice>
            Broadcast queued.{' '}
            <Link
              className="font-medium underline"
              href={appHref(appId as string, `sessions/${sessionId}`)}
            >
              Track session {sessionId}
            </Link>
          </SuccessNotice>
        ) : null}

        <ErrorNotice error={send.error} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Message</CardTitle>
              <CardDescription>
                What gets delivered, and through which channel.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Transport">
                <Select
                  value={transport}
                  onValueChange={(v) => {
                    setTransport(v);
                    setTemplateId('');
                  }}
                >
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
              <Field label="Message source">
                <Select value={mode} onValueChange={(v) => setMode(v as MessageMode)}>
                  <SelectTrigger aria-label="Message source">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="content">Inline content</SelectItem>
                    <SelectItem value="template">Approved template</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {mode === 'content' ? (
              <Field
                label="Content"
                htmlFor="b-content"
                hint="Placeholders resolved by the transport config, e.g. {%address%}."
              >
                <Textarea
                  id="b-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Your cash transfer of NPR 5,000 has been approved."
                />
              </Field>
            ) : (
              <Field
                label="Template"
                hint={
                  transport
                    ? 'Only templates belonging to the selected transport are listed.'
                    : 'Select a transport first.'
                }
              >
                <Select
                  value={templateId}
                  onValueChange={setTemplateId}
                  disabled={!transport}
                >
                  <SelectTrigger aria-label="Template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.cuid} value={t.cuid}>
                        {t.name} ({t.language}) — {t.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            <Field
              label="Message meta"
              hint="Channel extras: email subject/cc, template variables, provider fields."
            >
              <JsonEditor
                rows={5}
                value={{}}
                placeholder='{ "subject": "Payment approved" }'
                onChange={(parsed) =>
                  setMeta(parsed === null ? null : (parsed as Record<string, unknown>))
                }
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recipients</CardTitle>
              <CardDescription>
                One address per line — or paste a comma-separated list.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Textarea
              rows={6}
              aria-label="Recipients"
              value={addressesRaw}
              onChange={(e) => setAddressesRaw(e.target.value)}
              placeholder={'+9779800000000\nops@example.org'}
            />
            <p className="text-sm text-muted-foreground">
              <span className="tabular font-medium">{addresses.length}</span> unique
              recipient{addresses.length === 1 ? '' : 's'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Delivery</CardTitle>
              <CardDescription>
                When it goes out and how hard Connect retries.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Trigger">
              <Select value={trigger} onValueChange={(v) => setTrigger(v as TriggerType)}>
                <SelectTrigger aria-label="Trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(TriggerType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {trigger === TriggerType.SCHEDULED ? (
              <Field label="Scheduled for" htmlFor="b-when">
                <Input
                  id="b-when"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required
                />
              </Field>
            ) : null}

            <Field label="Max attempts" htmlFor="b-attempts">
              <Input
                id="b-attempts"
                type="number"
                min="1"
                max="10"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
              />
            </Field>
            <Field label="Retry interval (minutes)" htmlFor="b-interval">
              <Input
                id="b-interval"
                type="number"
                min="1"
                value={attemptInterval}
                onChange={(e) => setAttemptInterval(e.target.value)}
              />
            </Field>
            <Field
              label="Webhook"
              htmlFor="b-webhook"
              hint="Called with delivery updates."
            >
              <Input
                id="b-webhook"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://your-app/callbacks/connect"
              />
            </Field>
            <Field
              label="Reference (xref)"
              htmlFor="b-xref"
              hint="Your own id — groups usage and reports."
            >
              <Input
                id="b-xref"
                value={xref}
                onChange={(e) => setXref(e.target.value)}
                placeholder="project-abc"
              />
            </Field>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button size="lg" disabled={!canSend || send.isPending}>
            {send.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            Send to {addresses.length} recipient{addresses.length === 1 ? '' : 's'}
          </Button>
        </div>
      </form>
    </>
  );
}
