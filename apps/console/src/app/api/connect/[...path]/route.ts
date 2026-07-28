import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const CONNECT_API_URL = (
  process.env.CONNECT_API_URL ?? 'http://localhost:3333/api/v1'
).replace(/\/+$/, '');

/**
 * Thin pass-through to the Connect API so the browser never needs the upstream
 * URL and CORS is never in play. The Connect SDK runs against this route as its
 * baseURL; the only header it needs carried through is the app scope.
 */
async function proxy(req: NextRequest, path: string[]) {
  const search = req.nextUrl.search;
  const target = `${CONNECT_API_URL}/${path.join('/')}${search}`;

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const appId = req.headers.get('app-id');
  if (appId) headers.set('app-id', appId);
  headers.set('accept', req.headers.get('accept') ?? 'application/json');

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      cache: 'no-store',
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        message: `Cannot reach Connect API at ${CONNECT_API_URL}: ${
          (err as Error).message
        }`,
      },
      { status: 502 },
    );
  }

  const body = await upstream.arrayBuffer();
  const resHeaders = new Headers();
  for (const key of ['content-type', 'content-disposition']) {
    const value = upstream.headers.get(key);
    if (value) resHeaders.set(key, value);
  }
  return new Response(body, { status: upstream.status, headers: resHeaders });
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const POST = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const PATCH = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const PUT = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
export const DELETE = (req: NextRequest, { params }: Ctx) => proxy(req, params.path);
