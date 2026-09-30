export interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'debug' | 'verbose';
  context: string;
  message: string;
}
