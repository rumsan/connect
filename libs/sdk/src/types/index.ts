export * from './broadcast.type';
export * from './session.type';
export * from './transport.type';
export * from './template.type';
export * from './interfaces';
export * from './broadcastLog.type';
export * from './queue.type';
export * from './twilio.type';
export * from './validation.type';
export * from './voice.type';

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
