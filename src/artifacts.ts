import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { log, RUN_DIR } from './logger.js';

export interface FailureArtifacts {
  screenshot: string | null;
  html: string | null;
  url: string;
  title: string;
}

/**
 * The single highest-value thing you can add to an automation you have to
 * maintain. A stack trace tells you the selector missed. These tell you what
 * the page actually was: a cookie wall, a login redirect, a 503, or a real
 * layout change. Captured at the moment of failure, because by the time anyone
 * reads the log the page is long gone.
 */
export async function captureFailure(page: Page, checkId: string): Promise<FailureArtifacts> {
  const dir = join(RUN_DIR, 'artifacts');
  mkdirSync(dir, { recursive: true });

  const result: FailureArtifacts = { screenshot: null, html: null, url: '', title: '' };

  try {
    result.url = page.url();
    result.title = await page.title();
  } catch {
    // Page may already be closed. Keep going, the other captures may still work.
  }

  try {
    const file = join(dir, `${checkId}.jpg`);
    await page.screenshot({ path: file, quality: 62, type: 'jpeg', fullPage: false });
    result.screenshot = `artifacts/${checkId}.jpg`;
  } catch (error) {
    log('warn', 'screenshot capture failed', { checkId });
  }

  try {
    const file = join(dir, `${checkId}.html`);
    writeFileSync(file, await page.content());
    result.html = `artifacts/${checkId}.html`;
  } catch {
    log('warn', 'html capture failed', { checkId });
  }

  log('error', 'check failed, artifacts captured', {
    checkId,
    url: result.url,
    pageTitle: result.title,
    screenshot: result.screenshot,
  });

  return result;
}
