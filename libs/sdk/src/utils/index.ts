export function getEnvValue<T>(key: string, defaultValue?: T): T {
  // Ensure the key exists in process.env or use default value if provided.
  if (!process.env[key] && !defaultValue) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return process.env[key] as T;
}
