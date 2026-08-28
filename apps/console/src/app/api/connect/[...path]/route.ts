import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { authOptions } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

const CONNECT_API_URL = (
  process.env.CONNECT_API_URL ?? 'http://localhost:3333/api/v1'
).replace(/\/+$/, '');

/**
 * Thin pass-through to the Connect API.
 *
 * It re-checks the session rather than trusting middleware alone: a matcher is
 * easy to widen by accident, and this route is what actually reaches the API.
 *
 * Note this gates *the console*, not Connect. Anything calling the Connect API
 * directly bypasses this route entirely.
 */
async function proxy(req: NextRequest, path: string[]) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json(
      { success: false, message: 'Not signed in.' },
      { status: 401 },
    );
  }

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
