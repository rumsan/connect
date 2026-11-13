/**
 * Thrown from `makeTransportReady` when a session can never be prepared —
 * retrying would fail the same way (its audio URL answers 4xx, say).
 *
 * The base worker turns it into READINESS_FAIL, so connect fails the session's
 * broadcasts and marks it FAILED, and releases the session gate at once.
 * Anything else a worker throws or returns `false` for is treated as possibly
 * temporary and leaves the session to be retried.
 */
export class TransportPrepareError extends Error {
  constructor(message: string, readonly errorTag: string) {
    super(message);
    this.name = 'TransportPrepareError';
  }
}
