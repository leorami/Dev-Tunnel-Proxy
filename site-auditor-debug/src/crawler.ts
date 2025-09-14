import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import pLimit from "p-limit";
import { runAudit } from "./index.js";
import type { CrawlOptions, CrawlSummary } from "./types.js";

function norm(u: string) {
  try {
    return new URL(u).toString();
  } catch {
    return "";
  }
}

function sameOriginOnly(seed: string, url: string): boolean {
  const a = new URL(seed);
  const b = new URL(url);
  return a.origin === b.origin;
}

async function fromSitemap(sitemapUrl: string): Promise<string[]> {
  const res = await fetch(sitemapUrl);
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`);
  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);
  const urls: string[] = [];
  if (data.urlset?.url) {
    const items = Array.isArray(data.urlset.url) ? data.urlset.url : [data.urlset.url];
    for (const it of items) {
      if (it.loc) urls.push(String(it.loc));
    }
  } else if (data.sitemapindex?.sitemap) {
    const smaps = Array.isArray(data.sitemapindex.sitemap) ? data.sitemapindex.sitemap : [data.sitemapindex.sitemap];
    for (const sm of smaps) {
      if (sm.loc) {
        const child = await fromSitemap(String(sm.loc));
        urls.push(...child);
      }
    }
  }
  return Array.from(new Set(urls.map(norm).filter(Boolean)));
}

export async function crawlAndAudit(opts: CrawlOptions) {
  const startedAt = new Date().toISOString();
  const baseOut = opts.audit.outputDir || path.resolve(process.cwd(), "site-auditor");
  const runDir = path.resolve(baseOut, `crawl-${startedAt.replace(/[:.]/g, "-")}`);
  fs.mkdirSync(runDir, { recursive: true });

  let seeds = (opts.startUrls || []).map(norm).filter(Boolean);
  if (opts.sitemapUrl) {
    try {
      const smUrls = await fromSitemap(opts.sitemapUrl);
      seeds = seeds.concat(smUrls);
    } catch (e) {
      console.error("Failed to parse sitemap:", e);
    }
  }
  seeds = Array.from(new Set(seeds));

  const seen = new Set<string>();
  const queue: string[] = [];
  for (const s of seeds) {
    if (!seen.has(s)) {
      seen.add(s);
      queue.push(s);
    }
  }

  const limit = pLimit(Math.max(1, opts.concurrency ?? 2));
  const maxPages = Math.max(1, opts.maxPages ?? 50);
  const sameOrigin = !!opts.sameOrigin;
  const delayMs = Math.max(0, opts.delayMs ?? 0);

  const pagesProcessed: CrawlSummary["pages"] = [];

  const workers: Promise<void>[] = [];

  async function schedule(url: string) {
    if (pagesProcessed.length >= maxPages) return;
    if (sameOrigin && !sameOriginOnly(seeds[0], url)) return;

    const auditOut = path.join(runDir, encodeURIComponent(url));
    const res = await runAudit({ ...opts.audit, url, outputDir: auditOut });

    const screenshots = (res.viewports || [])
      .map(v => v.screenshotPath ? path.relative(runDir, v.screenshotPath) : null)
      .filter(Boolean) as string[];

    pagesProcessed.push({
      url,
      outputDir: path.relative(runDir, res.outputDir),
      consoleErrors: res.console.errors.length + res.console.pageErrors.length,
      httpIssues: res.network.httpIssues.length,
      networkFailures: res.network.failures.length,
      screenshots
    });
  }

  while (queue.length && pagesProcessed.length < maxPages) {
    const url = queue.shift()!;
    workers.push(limit(() => schedule(url)));
    if (delayMs) await new Promise(r => setTimeout(r, delayMs));
  }

  await Promise.all(workers);

  const summary: CrawlSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalPages: pagesProcessed.length,
    pages: pagesProcessed
  };

  fs.writeFileSync(path.join(runDir, "crawl-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  return { runDir, summary };
}
