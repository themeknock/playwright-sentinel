import { log } from './logger.js';

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  label: string;
}

/**
 * Errors worth retrying are transient: a navigation timeout, a socket reset, a
 * rate limit. A missing element after the page rendered is a real failure and
 * retrying it just multiplies the wait before you find out.
 */
const TRANSIENT = [
  /timeout/i,
  /net::ERR_/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /socket hang up/i,
  /Target (page|closed)/i,
  /Navigation failed/i,
  /429/,
  /503/,
];

export function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return TRANSIENT.some((pattern) => pattern.test(message));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseMs = options.baseMs ?? 700;
  const maxMs = options.maxMs ?? 8000;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (!isTransient(error) || attempt === attempts) {
        log('error', 'giving up', {
          label: options.label,
          attempt,
          transient: isTransient(error),
          message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
        });
        throw error;
      }

      // Exponential backoff with jitter. Without the jitter, a batch of workers
      // that fail together retry together and hit the site as one wave.
      const backoff = Math.min(maxMs, baseMs * 2 ** (attempt - 1));
      const delay = Math.round(backoff * (0.7 + Math.random() * 0.6));

      log('warn', 'transient failure, retrying', {
        label: options.label,
        attempt,
        nextInMs: delay,
        message: error instanceof Error ? error.message.slice(0, 120) : String(error).slice(0, 120),
      });

      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError;
}
