/**
 * Constants for broadcast and scheduling configuration
 */
export const BROADCAST_CONSTANTS = {
  /**
   * Default scheduling window in hours
   * Messages scheduled beyond this window will not be queued immediately
   * but picked up by ScheduledWindowWorker when they enter the window
   */
  DEFAULT_SCHEDULE_WINDOW_HOURS: 48,

  /**
   * Default batch size for processing scheduled messages
   * Number of messages processed per scheduler tick
   */
  DEFAULT_SCHEDULER_BATCH_SIZE: 50,

  /**
   * Interval for Redis ZSET scheduler worker tick (in milliseconds)
   * How frequently the scheduler checks for due messages
   */
  SCHEDULER_TICK_INTERVAL_MS: 1000,

  /**
   * Interval for scheduled window worker tick (in milliseconds)
   * How frequently the worker checks for messages entering the scheduling window
   */
  WINDOW_WORKER_INTERVAL_MS: 60000, // 60 seconds

  /**
   * Default Redis key for scheduler sorted set
   */
  DEFAULT_SCHEDULER_ZSET_KEY: 'connect:broadcast:schedule:zset',

  /**
   * Default Redis key for scheduler payload hash
   */
  DEFAULT_SCHEDULER_PAYLOAD_KEY: 'connect:broadcast:schedule:payload',

  /**
   * Default Redis key for scheduler processing list
   */
  DEFAULT_SCHEDULER_PROCESSING_KEY: 'connect:broadcast:schedule:processing',

  DEFAULT_BROADCAST_PRICE_UPDATE_WINDOW_MILLISECONDS: 3600000, // 1 hour

  /**
   * How long a broadcast may sit claimed by a worker before the reclaim sweeper
   * assumes the worker died and hands it back.
   *
   * Must stay well above the worker-side BATCH_TTL_MS (120s) so a live worker's
   * own reaper gets the first chance to report a real call failure — this only
   * exists for workers that are gone and can no longer report anything.
   */
  DEFAULT_CLAIM_TTL_MS: 600000, // 10 minutes

  /** How often the reclaim sweeper scans for stale claims and stalled sessions. */
  RECLAIM_WORKER_INTERVAL_MS: 60000, // 60 seconds

  /** Max in-progress sessions examined per assignment sweep. */
  RECLAIM_SESSION_SCAN_LIMIT: 100,

  /**
   * Minimum overflow before a further worker is woken for a session. Preparing
   * a worker costs an audio upload plus its readiness wait, so it is not worth
   * doing for a couple of addresses.
   */
  DEFAULT_SPILLOVER_MIN: 1,

  /**
   * A worker is considered gone after this many missed heartbeats.
   */
  WORKER_STALE_HEARTBEATS: 3,
} as const;

/**
 * Scheduler types
 */
export enum SchedulerType {
  BULL = 'bull',
  REDIS_ZSET = 'redis_zset',
}
