'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { CreateTransportDialog } from '../../../../../components/create-transport-dialog';
import { ConfirmDestructive } from '../../../../../components/ui/alert-dialog';
import { Button } from '../../../../../components/ui/button';
import {
  Card,
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
  Json,
  PageHead,
  StatusBadge,
  formatDate,
} from '../../../../../components/ui/feedback';
import { Input } from '../../../../../components/ui/input';
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
  useDeleteTransport,
  useRemoveTransportPricing,
  useSetTransportPricing,
  useTransports,
} from '../../../../../lib/hooks';
import { CreditUnitType, type Transport } from '../../../../../lib/types';

function PricingDialog({ transport }: { transport: Transport }) {
  const setPricing = useSetTransportPricing();
  const removePricing = useRemoveTransportPricing();
  const existing = transport.Pricing;
  const [open, setOpen] = useState(false);

  const [creditPerUnit, setCreditPerUnit] = useState(String(existing?.creditPerUnit ?? 1));
  const [unitType, setUnitType] = useState<CreditUnitType>(
    (existing?.unitType as CreditUnitType) ?? CreditUnitType.MESSAGE,
  );
  const [currency, setCurrency] = useState(existing?.currency ?? 'USD');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await setPricing.mutateAsync({
      cuid: transport.cuid,
      creditPerUnit: Number(creditPerUnit),
      unitType,
      currency: currency.trim() || 'USD',
      notes: notes?.trim() || undefined,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Pricing
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pricing — {transport.name}</DialogTitle>
          <DialogDescription>What one message costs in credits.</DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="pricing" className="flex flex-col gap-4" onSubmit={submit}>
            <ErrorNotice error={setPricing.error ?? removePricing.error} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Credit per unit" htmlFor="p-credit">
                <Input
                  id="p-credit"
                  type="number"
                  step="0.0001"
                  min="0"
                  value={creditPerUnit}
                  onChange={(e) => setCreditPerUnit(e.target.value)}
                  required
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
              <Field label="Currency" htmlFor="p-currency">
                <Input
                  id="p-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Notes" htmlFor="p-notes">
              <Input
                id="p-notes"
                value={notes ?? ''}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. negotiated rate, valid until Q4"
              />
            </Field>
          </form>
        </DialogBody>

        <DialogFooter>
          {existing ? (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive hover:bg-destructive/10"
              disabled={removePricing.isPending}
              onClick={async () => {
                await removePricing.mutateAsync(transport.cuid);
                setOpen(false);
              }}
            >
              Remove pricing
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="pricing" disabled={setPricing.isPending}>
            {setPricing.isPending ? <Loader2 className="animate-spin" /> : null}
            Save pricing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDialog({ transport }: { transport: Transport }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Config
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Config — {transport.name}</DialogTitle>
          <DialogDescription>
            Reuse this setup in another application from its transport picker.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Json value={transport.config} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export default function TransportsPage() {
  const { data, isLoading, error } = useTransports();
  const remove = useDeleteTransport();
  const transports = data?.data ?? [];

  return (
    <>
      <PageHead
        title="Transports"
        subtitle="Delivery channels this application can send through."
        actions={<CreateTransportDialog />}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Configured transports</CardTitle>
            <CardDescription>
              Set up from a provider template, or copied from another application.
            </CardDescription>
          </div>
        </CardHeader>

        {isLoading ? (
          <TableSkeleton columns={6} />
        ) : error ? (
          <div className="p-4">
            <ErrorNotice error={error} />
          </div>
        ) : transports.length === 0 ? (
          <Empty
            title="No transports configured"
            hint="Pick a provider template — Twilio, Sparrow, SMTP and others are ready to go — or copy a transport you already set up in another application."
            action={<CreateTransportDialog />}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Transport id</TableHead>
                <TableHead>Pricing</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {transports.map((transport) => (
                <TableRow key={transport.cuid}>
                  <TableCell className="font-medium">{transport.name}</TableCell>
                  <TableCell>
                    <StatusBadge status={transport.type} />
                  </TableCell>
                  <TableCell>
                    <CopyId value={transport.cuid} />
                  </TableCell>
                  <TableCell className="tabular whitespace-nowrap">
                    {transport.Pricing ? (
                      <>
                        {transport.Pricing.creditPerUnit} {transport.Pricing.currency} /{' '}
                        {transport.Pricing.unitType}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(transport.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <ConfigDialog transport={transport} />
                      <PricingDialog transport={transport} />
                      <ConfirmDestructive
                        title={`Delete "${transport.name}"?`}
                        description="Broadcasts already sent through this transport are kept, but nothing new can be sent through it."
                        onConfirm={() => remove.mutate(transport.cuid)}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10"
                          disabled={remove.isPending}
                        >
                          Delete
                        </Button>
                      </ConfirmDestructive>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </>
  );
}
