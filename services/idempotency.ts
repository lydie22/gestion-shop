export function createIdempotencyKey(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  const randomPart = randomUuid ?? Math.random().toString(36).slice(2, 14);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}
