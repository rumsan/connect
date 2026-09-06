# Log streaming

Both backends expose their logs as a Server-Sent Events stream. New clients get
the last ~200 entries replayed immediately, then stream live.

| App               | Endpoint                                   |
| ----------------- | ------------------------------------------ |
| `connect`         | `http://localhost:3333/api/v1/logs/stream` |
| `asterisk-worker` | `http://localhost:5653/api/logs/stream`    |

## Consume from a browser

```js
const es = new EventSource('http://localhost:3333/api/v1/logs/stream');

es.onmessage = (event) => {
  const log = JSON.parse(event.data);
  // { timestamp, level, context, message }
  console.log(`[${log.context}] ${log.message}`);
};

es.onerror = () => console.error('SSE connection lost');
```

## Consume from a terminal

```bash
curl -N http://localhost:3333/api/v1/logs/stream
```

## How each app is wired

`asterisk-worker` replaces the Nest logger outright
(`app.useLogger(logStreamService)`).

`connect` keeps Winston as its logger and mirrors output into the stream via
[`LogStreamTransport`](../apps/connect/src/utils/log-stream.transport.ts), added
to `loggerInstance` in `bootstrap()`. Console formatting and the production
`logs/error.log` / `logs/combine.log` file transports are unaffected.
