# Site Auditor Debug (with Crawler)

A drop-in Puppeteer toolkit for screenshotting at multiple breakpoints, capturing console/page/network issues, dumping computed styles (all/selectors/tags), **and crawling** sets of URLs or a sitemap. Works as both a CLI and a library.

## Quick Start

```bash
# 1) Copy this folder into your repo, then:
pnpm i
pnpm run build

# 2) Single page audit
node dist/cli.js https://example.com

# 3) Single page with named breakpoints and styles for tags
node dist/cli.js https://example.com \
  --viewports "375x812@mobile,1280x800@laptop" \
  --styles-mode tags --tags img,button --max-elements 500

# 4) Crawl mode (same-origin by default)
node dist/cli.js --crawl \
  --start-urls https://example.com \
  --max-pages 25 \
  --concurrency 3 \
  --viewports "375x812@mobile,1440x900@desktop"

# 5) Crawl from sitemap
node dist/cli.js --crawl \
  --sitemap https://example.com/sitemap.xml \
  --max-pages 100 --concurrency 4
```

Outputs are written to `site-auditor/<timestamp>/...` for single page runs, or `site-auditor/crawl-<timestamp>/...` for crawls. Each page audited has a `report.json` plus a `screenshots/` folder. Crawls also write a top-level `crawl-summary.json` with lightweight per-page stats.

## CLI Options

- `--headless` (default `true`) — run Chromium headless
- `--waitUntil` (`load|domcontentloaded|networkidle0|networkidle2`, default `networkidle2`)
- `--timeout` — navigation timeout (ms)
- `--output` — base output dir (timestamped subdir created per run)
- `--viewports` — CSV like `375x812@mobile,768x1024@tablet,1440x900@desktop`
- `--wait` — extra wait after navigation (ms) for lazy content
- `--block` — CSV of substrings to block in requests (ads/analytics)
- `--styles-mode` — `all|selectors|tags|off`
- `--styles-pick` — comma list of CSS properties to keep or `all`
- `--selectors` — comma list (used with `styles-mode=selectors`)
- `--tags` — comma list (used with `styles-mode=tags`)
- `--max-elements` — cap number of elements for style dump (default 200)
- `--crawl` — enable crawler
- `--start-urls` — comma list of starting URLs
- `--sitemap` — sitemap URL to seed from
- `--same-origin` — restrict crawl to first start URL origin (default `true`)
- `--max-pages` — limit pages to audit (default 50)
- `--concurrency` — parallel page audits (default 2)
- `--crawl-delay` — delay between scheduling pages (ms)

## Programmatic Usage

```ts
import { runAudit } from "./dist/index.js";
import { crawlAndAudit } from "./dist/crawler.js";

// Single page
await runAudit({
  url: "https://example.com",
  headless: true,
  viewports: [
    { width: 390, height: 844, name: "iPhone-13" },
    { width: 1440, height: 900, name: "desktop" }
  ],
  styles: { mode: "selectors", selectors: [".hero",".cta"] }
});

// Crawl
await crawlAndAudit({
  startUrls: ["https://example.com"],
  sameOrigin: true,
  maxPages: 30,
  concurrency: 3,
  audit: {
    headless: true,
    viewports: [{ width: 1440, height: 900, name: "desktop" }],
    styles: { mode: "tags", tags: ["img","button"] }
  }
});
```

## Notes

- Request blocking uses simple substring matching via `--block` for quick noise reduction.
- CSS computed styles are limited by `--max-elements` (default 200) to keep JSON sizes reasonable.
- All outputs are JSON and PNGs, making it easy to diff in CI.
- If you need Playwright instead of Puppeteer, the library surface is small and easy to port.
