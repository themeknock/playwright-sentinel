import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import { captureFailure, type FailureArtifacts } from './artifacts.js';
import { log, RUN_DIR, setRunId } from './logger.js';
import { resolve, type HealingSelector, type SelectorResolution } from './selector.js';
import { withRetry } from './retry.js';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

interface Check {
  id: string;
  label: string;
  url: string;
  selectors: HealingSelector[];
  /** Runs after selectors resolve. Throw to fail the check. */
  assert?: (page: Page) => Promise<Record<string, unknown>>;
}

/**
 * Real targets. toscrape.com exists specifically for automation practice, which
 * is why the suite points there rather than at somebody's production site.
 */
const CHECKS: Check[] = [
  {
    id: 'catalogue-grid',
    label: 'Book catalogue renders a product grid',
    url: 'https://books.toscrape.com/',
    selectors: [
      { name: 'product-card', candidates: ['article.product_pod', '.product_pod', 'li .product_pod'], minCount: 10 },
      { name: 'price', candidates: ['.price_color', 'p.price_color'], minCount: 10 },
    ],
    assert: async (page) => {
      const titles = await page.$$eval('article.product_pod h3 a', (els) =>
        els.map((e) => e.getAttribute('title')).filter(Boolean),
      );
      if (titles.length < 10) throw new Error(`expected 10+ titles, extracted ${titles.length}`);
      return { extracted: titles.length, sample: titles[0] };
    },
  },
  {
    id: 'quote-extraction',
    label: 'Quotes page yields quote and author pairs',
    url: 'https://quotes.toscrape.com/',
    selectors: [
      { name: 'quote-block', candidates: ['div.quote', '.quote'], minCount: 5 },
    ],
    assert: async (page) => {
      const rows = await page.$$eval('div.quote', (els) =>
        els.map((e) => ({
          text: e.querySelector('.text')?.textContent?.trim() ?? '',
          author: e.querySelector('.author')?.textContent?.trim() ?? '',
        })),
      );
      const complete = rows.filter((r) => r.text && r.author);
      if (complete.length < 5) throw new Error(`only ${complete.length} complete quote rows`);
      return { extracted: complete.length, sample: complete[0].author };
    },
  },
  {
    id: 'selector-drift',
    label: 'Healing selector survives a renamed class',
    url: 'https://quotes.toscrape.com/',
    selectors: [
      {
        name: 'tag-list',
        // The first two are deliberately stale, standing in for the class rename
        // that breaks these scripts in the wild. The run should still pass and
        // report the drift rather than fall over.
        candidates: ['.tags-v2-container', 'div[data-tags]', '.tags', '.tag-item'],
        minCount: 1,
      },
    ],
    assert: async (page) => {
      const tags = await page.$$eval('.tag-item, .tags a.tag', (els) => els.map((e) => e.textContent?.trim()));
      return { extracted: tags.length };
    },
  },
  {
    id: 'login-flow',
    label: 'Login form submits and lands authenticated',
    url: 'https://quotes.toscrape.com/login',
    selectors: [
      { name: 'username', candidates: ['input#username', 'input[name="username"]'] },
      { name: 'password', candidates: ['input#password', 'input[name="password"]'] },
    ],
    assert: async (page) => {
      await page.fill('input#username', 'demo');
      await page.fill('input#password', 'demo');
      await Promise.all([
        page.waitForLoadState('domcontentloaded'),
        page.click('input[type="submit"]'),
      ]);
      const loggedIn = await page.locator('a[href="/logout"]').count();
      if (loggedIn === 0) throw new Error('no logout link after submit, session not established');
      return { authenticated: true };
    },
  },
  {
    id: 'missing-element',
    label: 'Absent element fails loudly with artifacts',
    url: 'https://books.toscrape.com/',
    selectors: [
      // Nothing on the page matches. This check is meant to fail, so the run
      // shows what a real failure looks like instead of only the happy path.
      { name: 'checkout-button', candidates: ['#checkout-now', '[data-testid="checkout"]', '.btn-checkout'] },
    ],
  },
];

interface CheckResult {
  id: string;
  label: string;
  url: string;
  status: 'pass' | 'fail';
  ms: number;
  attempts: number;
  selectors: SelectorResolution[];
  data?: Record<string, unknown>;
  error?: string;
  artifacts?: FailureArtifacts;
}

async function runCheck(browser: Browser, check: Check): Promise<CheckResult> {
  const started = Date.now();
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  });
  const page = await context.newPage();

  const resolutions: SelectorResolution[] = [];
  let attempts = 0;

  try {
    const data = await withRetry(
      async (attempt) => {
        attempts = attempt;
        resolutions.length = 0;

        await page.goto(check.url, { waitUntil: 'domcontentloaded', timeout: 25000 });

        for (const selector of check.selectors) {
          const { locator, resolution } = await resolve(page, selector);
          resolutions.push(resolution);
          if (!locator) {
            throw new Error(
              `selector "${selector.name}" matched none of ${selector.candidates.length} candidates`,
            );
          }
        }

        return check.assert ? await check.assert(page) : {};
      },
      { label: check.id, attempts: 3 },
    );

    log('info', 'check passed', { checkId: check.id, ms: Date.now() - started, attempts });

    return {
      id: check.id,
      label: check.label,
      url: check.url,
      status: 'pass',
      ms: Date.now() - started,
      attempts,
      selectors: resolutions,
      data,
    };
  } catch (error) {
    const artifacts = await captureFailure(page, check.id);
    return {
      id: check.id,
      label: check.label,
      url: check.url,
      status: 'fail',
      ms: Date.now() - started,
      attempts,
      selectors: resolutions,
      error: error instanceof Error ? error.message : String(error),
      artifacts,
    };
  } finally {
    await context.close();
  }
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
setRunId(runId);

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
log('info', 'run started', { runId, checks: CHECKS.length });

const results: CheckResult[] = [];
for (const check of CHECKS) {
  results.push(await runCheck(browser, check));
}

await browser.close();

const summary = {
  runId,
  finishedAt: new Date().toISOString(),
  total: results.length,
  passed: results.filter((r) => r.status === 'pass').length,
  failed: results.filter((r) => r.status === 'fail').length,
  drifted: results.flatMap((r) => r.selectors).filter((s) => s.drift && s.matched).length,
  totalMs: results.reduce((sum, r) => sum + r.ms, 0),
  results,
};

writeFileSync(join(RUN_DIR, 'latest.json'), JSON.stringify(summary, null, 2));
log('info', 'run finished', {
  passed: summary.passed,
  failed: summary.failed,
  drifted: summary.drifted,
  totalMs: summary.totalMs,
});
