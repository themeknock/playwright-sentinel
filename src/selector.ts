import type { Page, Locator } from 'playwright-core';
import { log } from './logger.js';

/**
 * A selector that is allowed to change under you.
 *
 * Long-lived automations break because a site ships a class rename, not because
 * the logic was wrong. Every selector here is a ranked list: the first entry is
 * the one we believe in, the rest are fallbacks in descending order of
 * confidence. Whichever one resolves is reported, so a run that quietly slid to
 * fallback #3 shows up in the log before it becomes a 3am outage.
 */
export interface HealingSelector {
  /** Stable name used in logs and reports. */
  name: string;
  /** Ranked candidates. Index 0 is the preferred selector. */
  candidates: string[];
  /** Minimum matches required for the candidate to count as resolved. */
  minCount?: number;
}

export interface SelectorResolution {
  name: string;
  matched: string | null;
  /** 0 means the preferred selector still works. Anything higher is drift. */
  tier: number;
  count: number;
  drift: boolean;
  ms: number;
}

export async function resolve(
  page: Page,
  selector: HealingSelector,
  timeoutMs = 8000,
): Promise<{ locator: Locator | null; resolution: SelectorResolution }> {
  const started = Date.now();
  const minCount = selector.minCount ?? 1;
  // Budget is split across candidates so a dead first choice cannot eat the
  // whole timeout and starve the fallbacks that would have worked.
  const perCandidate = Math.max(1200, Math.floor(timeoutMs / selector.candidates.length));

  for (let tier = 0; tier < selector.candidates.length; tier++) {
    const candidate = selector.candidates[tier];
    try {
      const locator = page.locator(candidate);
      await locator.first().waitFor({ state: 'attached', timeout: perCandidate });
      const count = await locator.count();
      if (count < minCount) continue;

      const resolution: SelectorResolution = {
        name: selector.name,
        matched: candidate,
        tier,
        count,
        drift: tier > 0,
        ms: Date.now() - started,
      };

      if (resolution.drift) {
        // Not an error. It is the early warning that the preferred selector is
        // dead and someone should update it before the fallbacks run out too.
        log('warn', 'selector drifted to fallback', {
          selector: selector.name,
          tier,
          matched: candidate,
          dead: selector.candidates.slice(0, tier),
        });
      }

      return { locator, resolution };
    } catch {
      // This candidate did not attach in its slice of the budget. Try the next.
    }
  }

  return {
    locator: null,
    resolution: {
      name: selector.name,
      matched: null,
      tier: -1,
      count: 0,
      drift: true,
      ms: Date.now() - started,
    },
  };
}
