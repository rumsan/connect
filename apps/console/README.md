# Connect Console

Next.js operator console for the Connect service. It is a **super-admin surface**:
it spans every registered application rather than living inside one.

## Running

```bash
cp apps/console/.env.example apps/console/.env.local   # point at your Connect API
pnpm nx dev console                                    # http://localhost:3000
```

Requires Node >= 18.17 (Next 14). The Connect API itself is started separately
with `pnpm start:dev` (defaults to `http://localhost:3333/api/v1`).

## What it covers

| Page | Connect endpoints |
| --- | --- |
| Dashboard | `GET /apps`, `GET /usage/:appId` per app |
| Applications | `GET /apps`, `POST /apps` |
| Transports | `/transports` CRUD + `/transports/:cuid/pricing` |
| Templates | `/template` CRUD + `POST /template/:transportId/sync` |
| Send broadcast | `POST /broadcasts` |
| Sessions | `/sessions`, `/sessions/:cuid/broadcasts`, `/sessions/:cuid/logs`, `/sessions/:cuid/trigger`, `/broadcasts/download` |
| Delivery logs | `GET /logs` |
| Usage & credits | `GET /usage/:appId`, `GET /usage/:appId/credits` (both also `/xref/:xref`) |

## How it talks to Connect

Against Connect's **existing HTTP API** — nothing in `apps/connect` or
`libs/sdk` was changed to support this console.

The `@rumsan/connect` SDK is deliberately not used here: it holds a single
`app-id` on a shared client, which does not fit a super-admin view that reads
across every app (and calls endpoints like `/apps` that are not app-scoped at
all). Instead `src/lib/api.ts` is a small typed fetch wrapper that takes `appId`
**per call** and unwraps Nest's `{ success, data, meta }` envelope. Response
shapes are mirrored in `src/lib/types.ts`.

All calls go to `/api/connect`, a pass-through route handler
(`src/app/api/connect/[...path]/route.ts`) that forwards to `CONNECT_API_URL`.
That keeps the upstream host server-side and takes CORS out of the picture.

## Layout

```
src/
  app/                  route per feature; api/connect is the proxy
  components/           shell, design-system primitives, JSON editor
  lib/
    api.ts              typed fetch wrapper over the Connect API
    types.ts            response/request shapes
    hooks.ts            React Query hooks, one per Connect operation
    app-context.tsx     which app is selected (persisted in localStorage)
```

Styling is a hand-rolled design system in `src/app/global.css` (CSS custom
properties, light + dark). No CSS framework dependency.
