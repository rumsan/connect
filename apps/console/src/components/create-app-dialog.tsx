'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useCreateApplication } from '../lib/hooks';
import {
  ApplicationEnvironment,
  type CreateApplicationResult,
} from '../lib/types';
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
import { ErrorNotice } from './ui/feedback';
import { Input } from './ui/input';
import { Field } from './ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

export function CreateAppDialog({
  children,
  onCreated,
}: {
  children: React.ReactNode;
  onCreated: (result: CreateApplicationResult) => void;
}) {
  const create = useCreateApplication();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState<ApplicationEnvironment>(
    ApplicationEnvironment.DEVELOPMENT,
  );
  const [publicKey, setPublicKey] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      environment,
      publicKey: publicKey.trim() || undefined,
    });
    onCreated(result);
    setOpen(false);
    setName('');
    setDescription('');
    setPublicKey('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create application</DialogTitle>
          <DialogDescription>
            An application scopes every transport, template and broadcast.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id="create-app" className="flex flex-col gap-4" onSubmit={submit}>
            <ErrorNotice error={create.error} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="app-name">
                <Input
                  id="app-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Rahat Field Ops"
                  required
                />
              </Field>
              <Field label="Environment">
                <Select
                  value={environment}
                  onValueChange={(v) => setEnvironment(v as ApplicationEnvironment)}
                >
                  <SelectTrigger aria-label="Environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ApplicationEnvironment).map((env) => (
                      <SelectItem key={env} value={env}>
                        {env}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Description" htmlFor="app-desc">
              <Input
                id="app-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this app sends"
              />
            </Field>

            <Field
              label="Public key (optional)"
              htmlFor="app-key"
              hint="Leave blank and Connect generates a keypair — the private key is shown only once."
            >
              <Input
                id="app-key"
                className="font-mono text-xs"
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                placeholder="0x…"
              />
            </Field>
          </form>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-app"
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending ? <Loader2 className="animate-spin" /> : null}
            Create application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
