import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RUN_DIR } from './logger.js';

const OUT = join(process.cwd(), 'report', 'dist');
mkdirSync(OUT, { recursive: true });

const summary = JSON.parse(readFileSync(join(RUN_DIR, 'latest.json'), 'utf8'));

// Carry the failure artifacts across so the report links to the real capture,
// not a description of one.
const artifactsSrc = join(RUN_DIR, 'artifacts');
if (existsSync(artifactsSrc)) cpSync(artifactsSrc, join(OUT, 'artifacts'), { recursive: true });
if (existsSync(join(RUN_DIR, 'run.ndjson'))) copyFileSync(join(RUN_DIR, 'run.ndjson'), join(OUT, 'run.ndjson'));

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const logLines = existsSync(join(RUN_DIR, 'run.ndjson'))
  ? readFileSync(join(RUN_DIR, 'run.ndjson'), 'utf8').trim().split('\n').slice(-14)
  : [];

const selectorRow = (s: any) => {
  if (!s.matched) {
    return `<div class="sel dead">
      <span class="sel-name">${esc(s.name)}</span>
      <span class="tag t-dead">no match</span>
      <span class="sel-ms">${s.ms} ms</span>
    </div>`;
  }
  return `<div class="sel ${s.drift ? 'drift' : ''}">
    <span class="sel-name">${esc(s.name)}</span>
    <code>${esc(s.matched)}</code>
    <span class="tag ${s.drift ? 't-drift' : 't-ok'}">${s.drift ? `fallback #${s.tier}` : 'preferred'}</span>
    <span class="sel-ms">${s.count} match${s.count === 1 ? '' : 'es'} · ${s.ms} ms</span>
  </div>`;
};

const checkCard = (r: any) => `
<article class="check ${r.status}">
  <header>
    <span class="dot"></span>
    <div class="ch-title">
      <h2>${esc(r.label)}</h2>
      <p><code>${esc(r.id)}</code> · <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></p>
    </div>
    <div class="ch-num">
      <b>${r.ms} ms</b>
      <small>${r.attempts} attempt${r.attempts === 1 ? '' : 's'}</small>
    </div>
  </header>

  <div class="sels">${r.selectors.map(selectorRow).join('')}</div>

  ${r.data && Object.keys(r.data).length
      ? `<dl class="data">${Object.entries(r.data)
          .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
          .join('')}</dl>`
      : ''}

  ${r.status === 'fail'
      ? `<div class="fail">
           <p class="err">${esc(r.error)}</p>
           <div class="fail-grid">
             <dl class="data">
               <div><dt>page title at failure</dt><dd>${esc(r.artifacts?.title)}</dd></div>
               <div><dt>url at failure</dt><dd>${esc(r.artifacts?.url)}</dd></div>
               <div><dt>retried</dt><dd>no, error was not transient</dd></div>
             </dl>
             ${r.artifacts?.screenshot
               ? `<a class="shot" href="${esc(r.artifacts.screenshot)}" target="_blank" rel="noopener">
                    <img src="${esc(r.artifacts.screenshot)}" alt="Page as captured when ${esc(r.id)} failed" loading="lazy" />
                    <span>screenshot captured at failure</span>
                  </a>`
               : ''}
           </div>
           ${r.artifacts?.html ? `<a class="dl" href="${esc(r.artifacts.html)}" target="_blank" rel="noopener">Download the page HTML as captured</a>` : ''}
         </div>`
      : ''}
</article>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Playwright Sentinel — run report</title>
<meta name="description" content="A resilience harness for long-lived Playwright automations: healing selectors, transient-only retry, and failure artifacts.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230C1118'/%3E%3Ccircle cx='16' cy='16' r='6' fill='%232DD4A7'/%3E%3C/svg%3E">
<style>
:root{
  --bg:#0B0F14;--surface:#121821;--surface-2:#171F2A;--line:#212B38;--line-2:#1A222D;
  --ink:#E8EDF3;--muted:#8896A8;--dim:#5F6D7E;
  --ok:#2DD4A7;--warn:#F0A23C;--bad:#F2604C;--accent:#5B93F5;
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:15px;line-height:1.55;-webkit-font-smoothing:antialiased}
code,.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:12.5px}
h1,h2,p,dl,dd{margin:0}
a{color:inherit}
img{max-width:100%;height:auto;display:block}
.wrap{max-width:1080px;margin:0 auto;padding:clamp(28px,5vw,64px) clamp(16px,4vw,32px) 72px}

header.top{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-bottom:34px}
.brand{display:flex;align-items:center;gap:12px}
.brand .mk{width:34px;height:34px;border-radius:9px;background:var(--surface-2);border:1px solid var(--line);display:grid;place-content:center}
.brand .mk i{width:11px;height:11px;border-radius:50%;background:var(--ok);display:block}
h1{font-size:19px;font-weight:600;letter-spacing:-.02em}
.brand p{font-size:13px;color:var(--muted)}
.runmeta{font-size:12.5px;color:var(--dim);text-align:right;line-height:1.7}

.lede{font-size:16px;color:var(--muted);max-width:72ch;margin-bottom:30px}
.lede b{color:var(--ink);font-weight:500}

.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:34px}
.sum{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:15px 16px}
.sum b{display:block;font-size:27px;font-weight:600;letter-spacing:-.03em;line-height:1.2}
.sum span{display:block;font-size:12px;color:var(--muted);margin-top:3px}
.sum.ok b{color:var(--ok)}.sum.bad b{color:var(--bad)}.sum.warn b{color:var(--warn)}

.check{background:var(--surface);border:1px solid var(--line);border-radius:11px;margin-bottom:13px;overflow:hidden}
.check header{display:flex;align-items:flex-start;gap:13px;padding:16px 18px;border-bottom:1px solid var(--line-2)}
.dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px;margin-top:7px}
.check.pass .dot{background:var(--ok);box-shadow:0 0 0 3px rgba(45,212,167,.13)}
.check.fail .dot{background:var(--bad);box-shadow:0 0 0 3px rgba(242,96,76,.15)}
.ch-title{flex:1;min-width:0}
.ch-title h2{font-size:15.5px;font-weight:550;letter-spacing:-.012em}
.ch-title p{font-size:12.5px;color:var(--dim);margin-top:3px;overflow:hidden;text-overflow:ellipsis}
.ch-title a{color:var(--dim);text-decoration:none}
.ch-title a:hover{color:var(--accent)}
.ch-num{text-align:right;flex:0 0 auto}
.ch-num b{display:block;font-size:14px;font-weight:550;font-family:"JetBrains Mono",monospace}
.ch-num small{font-size:11.5px;color:var(--dim)}

.sels{padding:6px 18px}
.sel{display:flex;align-items:center;gap:11px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid var(--line-2)}
.sel:last-child{border-bottom:0}
.sel-name{font-size:13px;color:var(--muted);min-width:104px}
.sel code{background:var(--surface-2);border:1px solid var(--line);padding:2px 7px;border-radius:4px;color:var(--ink)}
.sel-ms{margin-left:auto;font-size:11.5px;color:var(--dim);font-family:"JetBrains Mono",monospace}
.tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:100px;letter-spacing:.02em}
.t-ok{background:rgba(45,212,167,.13);color:var(--ok)}
.t-drift{background:rgba(240,162,60,.14);color:var(--warn)}
.t-dead{background:rgba(242,96,76,.14);color:var(--bad)}

.data{display:flex;flex-wrap:wrap;gap:22px;padding:13px 18px;border-top:1px solid var(--line-2)}
.data dt{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em}
.data dd{font-size:13.5px;font-weight:500;margin-top:2px;font-family:"JetBrains Mono",monospace}

.fail{padding:0 18px 18px;border-top:1px solid var(--line-2)}
.err{font-family:"JetBrains Mono",monospace;font-size:12.5px;color:var(--bad);background:rgba(242,96,76,.08);border:1px solid rgba(242,96,76,.22);padding:10px 13px;border-radius:7px;margin-top:14px}
.fail .data{border-top:0;padding:14px 0 0}
.fail-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:20px;align-items:start}
.shot{display:block;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--surface-2);text-decoration:none}
.shot img{width:100%}
.shot span{display:block;padding:8px 11px;font-size:11.5px;color:var(--dim);border-top:1px solid var(--line-2)}
.dl{display:inline-block;margin-top:13px;font-size:13px;color:var(--accent);text-decoration:none}
.dl:hover{text-decoration:underline}

.logs{margin-top:34px;background:var(--surface);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.logs h2{font-size:14px;font-weight:550;padding:14px 18px;border-bottom:1px solid var(--line-2)}
.logs pre{margin:0;padding:14px 18px;overflow-x:auto;font-family:"JetBrains Mono",monospace;font-size:11.5px;line-height:1.85;color:var(--muted)}
.logs .lvl-warn{color:var(--warn)}
.logs .lvl-error{color:var(--bad)}

footer{margin-top:38px;padding-top:20px;border-top:1px solid var(--line-2);font-size:13px;color:var(--dim);display:flex;gap:16px;flex-wrap:wrap;justify-content:space-between}
footer a{color:var(--accent);text-decoration:none}

@media(max-width:820px){
  .summary{grid-template-columns:repeat(2,1fr)}
  .fail-grid{grid-template-columns:1fr}
  .sel-ms{margin-left:0;width:100%}
}
</style>
</head>
<body>
<div class="wrap">

  <header class="top">
    <div class="brand">
      <span class="mk"><i></i></span>
      <div>
        <h1>Playwright Sentinel</h1>
        <p>Resilience harness for long-lived browser automations</p>
      </div>
    </div>
    <p class="runmeta">
      run <code>${esc(summary.runId)}</code><br>
      finished ${esc(new Date(summary.finishedAt).toUTCString())}<br>
      chromium via playwright-core
    </p>
  </header>

  <p class="lede">
    Automations do not break because the logic was wrong. They break because a site renames a class,
    an auth session silently expires, or a network blip lands mid navigation. This harness is built
    around those three: <b>selectors heal down a ranked fallback chain and report the drift</b>,
    <b>only transient errors are retried</b>, and <b>every failure captures the page as it actually
    was</b>. The run below is real and unedited, including the check that is designed to fail.
  </p>

  <div class="summary">
    <div class="sum ok"><b>${summary.passed}</b><span>checks passed</span></div>
    <div class="sum ${summary.failed ? 'bad' : ''}"><b>${summary.failed}</b><span>failed</span></div>
    <div class="sum ${summary.drifted ? 'warn' : ''}"><b>${summary.drifted}</b><span>selectors drifted</span></div>
    <div class="sum"><b>${(summary.totalMs / 1000).toFixed(1)}s</b><span>total run time</span></div>
  </div>

  ${summary.results.map(checkCard).join('')}

  <section class="logs">
    <h2>Structured log, last ${logLines.length} lines</h2>
    <pre>${logLines
      .map((l) => {
        const level = (JSON.parse(l).level as string) || 'info';
        return `<span class="lvl-${esc(level)}">${esc(l)}</span>`;
      })
      .join('\n')}</pre>
  </section>

  <footer>
    <span>One NDJSON object per line, straight to stdout and to disk.</span>
    <a href="run.ndjson" target="_blank" rel="noopener">Raw log</a>
  </footer>

</div>
</body>
</html>`;

writeFileSync(join(OUT, 'index.html'), html);
console.log(`report written to ${join(OUT, 'index.html')}`);
