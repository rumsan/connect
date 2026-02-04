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
} as const;

/**
 * Scheduler types
 */
export enum SchedulerType {
  BULL = 'bull',
  REDIS_ZSET = 'redis_zset',
}
