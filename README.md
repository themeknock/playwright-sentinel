# Playwright Sentinel

A resilience harness for Playwright automations that have to keep running after
you stop looking at them.

**Live run report:** https://playwright-sentinel.themeknock.workers.dev

Long-lived automations rarely break because the logic was wrong. They break
because a site renames a class, a session quietly expires, or a network blip
lands mid navigation. This is built around those three.

## What it does

**Healing selectors.** Every selector is a ranked list rather than a single
string. If the preferred one stops matching, the next candidate takes over and
the run logs a `selector drifted to fallback` warning naming the dead one. You
find out while the fallbacks still have room, not when the last one runs out.

```ts
{ name: 'tag-list', candidates: ['.tags-v2-container', 'div[data-tags]', '.tags', '.tag-item'] }
// run output: drifted to tier 2 (.tags), dead: ['.tags-v2-container', 'div[data-tags]']
```

The timeout budget is split across candidates, so a dead first choice cannot eat
the whole window and starve a fallback that would have worked.

**Transient-only retry.** Navigation timeouts, resets, 429s and 503s get
exponential backoff with jitter. A missing element after the page rendered is a
real failure and is not retried, because retrying it only delays the answer. The
jitter matters once more than one worker is running, otherwise a batch that
fails together retries together and arrives as one wave.

**Failure artifacts.** On failure the harness captures the screenshot, the full
HTML and the page title and URL at that moment. That is normally what separates
"the selector missed" from "we got a cookie wall" or "we were redirected to
login".

**Structured logs.** One NDJSON object per line to stdout and to disk. Greppable
by hand, parseable by anything, and it survives a platform log collector.

## Running it

```bash
npm install
npm run build
npm run run:checks    # drives real pages, writes runs/latest.json
npm run report        # builds the static report in report/dist
```

Targets are on `toscrape.com`, which exists for automation practice, so the
suite does not point at anyone's production site. `CHROME_PATH` overrides the
browser location.

## Layout

```
src/selector.ts    ranked candidates, drift detection
src/retry.ts       transient classification, backoff with jitter
src/artifacts.ts   screenshot, HTML and context capture on failure
src/logger.ts      NDJSON logging
src/run.ts         the check suite and runner
src/report.ts      static HTML report generator
```

One of the five checks is designed to fail, so the report shows what a real
failure looks like rather than only the happy path.
