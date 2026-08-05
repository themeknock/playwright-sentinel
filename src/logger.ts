import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type Level = 'info' | 'warn' | 'error';

export const RUN_DIR = join(process.cwd(), 'runs');
mkdirSync(RUN_DIR, { recursive: true });

const LOG_FILE = join(RUN_DIR, 'run.ndjson');

let runId = 'local';
export function setRunId(id: string) {
  runId = id;
}

/**
 * One JSON object per line. Greppable in a terminal, parseable by anything, and
 * it survives being piped through a platform log collector without a formatter.
 */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}) {
  const entry = { ts: new Date().toISOString(), runId, level, message, ...fields };
  const line = JSON.stringify(entry);

  const tag = level === 'error' ? '✖' : level === 'warn' ? '▲' : '·';
  const detail = Object.keys(fields).length ? ' ' + JSON.stringify(fields) : '';
  console.log(`${tag} ${message}${detail}`);

  try {
    appendFileSync(LOG_FILE, line + '\n');
  } catch {
    // Logging must never be the thing that takes the run down.
  }
}
