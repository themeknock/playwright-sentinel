# Playwright Sentinel

**A Playwright harness that tells you a selector is dying while the fallbacks still have room,
instead of failing at 3am when the last one runs out.**

Long-lived automations rarely break because the logic was wrong. They break because a site renames
a class, a session quietly expires, or a network blip lands mid navigation. This is built around
those three.

**Live run report:** https://playwright-sentinel.themeknock.workers.dev

Try it in 30 seconds:

```bash
git clone https://github.com/themeknock/playwright-sentinel && cd playwright-sentinel
npm install && npm run build && npm run run:checks
```

It drives five real pages on `toscrape.com` and prints what happened. Actual output from that
command, run on 16 September 2026:

```
· check passed                   {"checkId":"catalogue-grid","ms":2680,"attempts":1}
· check passed                   {"checkId":"quote-extraction","ms":960,"attempts":1}
▲ selector drifted to fallback   {"selector":"tag-list","tier":2,"matched":".tags","dead":[".tags-v2-container","div[data-tags]"]}
· check passed                   {"checkId":"selector-drift","ms":5001,"attempts":1}
· check passed                   {"checkId":"login-flow","ms":2567,"attempts":1}
✖ giving up                      {"label":"missing-element","attempt":1,"transient":false,"message":"selector \"checkout-button\" matched none of 3 candidates"}
✖ check failed, artifacts captured {"checkId":"missing-element","url":"https://books.toscrape.com/","screenshot":"artifacts/missing-element.jpg"}
· run finished                   {"passed":4,"failed":1,"drifted":1,"totalMs":21205}
```

The two interesting lines are the ones that are not "passed". `selector drifted to fallback` is the
early warning: that check still passed, but its first two selectors are already dead. `giving up`
declined to retry, because the element was missing after the page rendered and retrying a real
failure only delays the answer. One of the five checks is designed to fail so the report shows what
a failure actually looks like, not only the happy path.

`CHROME_PATH` overrides the browser location. Targets are on `toscrape.com`, which exists for
automation practice, so the suite does not point at anyone's production site.

**The same idea one level up:** [Second Look](https://github.com/themeknock/second-look) checks
agent output instead of page output — it reads what an AI agent told a user and checks every claim
against the agent's own tool logs. Live: https://review.themeknock.net

---

## What it does

**Healing selectors.** Every selector is a ranked list rather than a single string. If the preferred
one stops matching, the next candidate takes over and the run logs a `selector drifted to fallback`
warning naming the dead one. You find out while the fallbacks still have room.

```ts
{ name: 'tag-list', candidates: ['.tags-v2-container', 'div[data-tags]', '.tags', '.tag-item'] }
// run output: drifted to tier 2 (.tags), dead: ['.tags-v2-container', 'div[data-tags]']
```

The timeout budget is split across candidates, so a dead first choice cannot eat the whole window
and starve a fallback that would have worked.

**Transient-only retry.** Navigation timeouts, resets, 429s and 503s get exponential backoff with
jitter. A missing element after the page rendered is a real failure and is not retried. The jitter
matters once more than one worker is running, otherwise a batch that fails together retries together
and arrives as one wave.

**Failure artifacts.** On failure the harness captures the screenshot, the full HTML and the page
title and URL at that moment. That is normally what separates "the selector missed" from "we got a
cookie wall" or "we were redirected to login".

**Structured logs.** One NDJSON object per line to stdout and to disk. Greppable by hand, parseable
by anything, and it survives a platform log collector.

## Running the report

```bash
npm run report        # builds the static report in report/dist from runs/latest.json
```

## Layout

```
src/selector.ts    ranked candidates, drift detection
src/retry.ts       transient classification, backoff with jitter
src/artifacts.ts   screenshot, HTML and context capture on failure
src/logger.ts      NDJSON logging
src/run.ts         the check suite and runner
src/report.ts      static HTML report generator
```
