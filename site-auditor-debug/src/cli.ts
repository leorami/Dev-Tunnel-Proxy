#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "node:path";
import fs from "node:fs";
import { runAudit } from "./index.js";
import { crawlAndAudit } from "./crawler.js";
import type { AuditOptions, CrawlOptions } from "./types.js";

const argv = await yargs(hideBin(process.argv))
  .scriptName("site-auditor")
  .usage("$0 <url> [options]")
  .positional("url", { type: "string", describe: "Page URL to audit (ignored if --crawl and --start-urls/--sitemap provided)" })
  .option("headless", { type: "boolean", default: true, describe: "Run Chrome headless" })
  .option("waitUntil", {
    type: "string",
    choices: ["load", "domcontentloaded", "networkidle0", "networkidle2"] as const,
    default: "networkidle2",
    describe: "Puppeteer navigation wait condition"
  })
  .option("timeout", { type: "number", default: 45000, describe: "Navigation timeout (ms)" })
  .option("output", { type: "string", describe: "Base output directory (timestamped subdir created)" })
  .option("viewports", {
    type: "string",
    describe: "CSV of WxH[@name] (e.g., 375x812@mobile,768x1024@tablet)"
  })
  .option("wait", { type: "number", default: 0, describe: "Extra wait after nav (ms)" })
  .option("block", {
    type: "string",
    describe: "Comma-separated substrings to block in requests (ads, trackers, etc.)"
  })
  .option("styles-mode", {
    type: "string",
    choices: ["all", "selectors", "tags", "off"] as const,
    default: "all",
    describe: "What elements to collect computed styles for"
  })
  .option("styles-pick", { type: "string", describe: "CSS props to keep (comma-separated) or 'all'" })
  .option("selectors", { type: "string", describe: "Comma-separated selectors (used when styles-mode=selectors)" })
  .option("tags", { type: "string", describe: "Comma-separated tag names (used when styles-mode=tags)" })
  .option("max-elements", { type: "number", default: 200, describe: "Cap number of elements for computed-style dump" })
  // Crawl options
  .option("crawl", { type: "boolean", default: false, describe: "Enable crawler mode" })
  .option("start-urls", { type: "string", describe: "Comma-separated list of starting URLs" })
  .option("sitemap", { type: "string", describe: "Sitemap URL to seed URLs from" })
  .option("same-origin", { type: "boolean", default: true, describe: "Restrict crawl to the same origin as the first start URL" })
  .option("max-pages", { type: "number", default: 50, describe: "Max pages to crawl" })
  .option("concurrency", { type: "number", default: 2, describe: "Concurrent page audits" })
  .option("crawl-delay", { type: "number", default: 0, describe: "Delay between scheduling pages (ms)" })
  .demandCommand(0)
  .help()
  .parse();

function parseViewports(spec?: string) {
  if (!spec) return undefined;
  return spec.split(",").map((s: string) => {
    const [wh, name] = s.split("@");
    const [w, h] = wh.toLowerCase().split("x").map((n: string) => parseInt(n.trim(), 10));
    return { width: w, height: h, name } as { width: number; height: number; name?: string };
  });
}

async function runSingle(url: string) {
  const stylesMode = argv["styles-mode"];
  const stylesPick = argv["styles-pick"] === "all"
    ? "all"
    : (argv["styles-pick"] ? (argv["styles-pick"] as string).split(",").map((s: string) => s.trim()).filter(Boolean) : undefined);

  const opts: AuditOptions = {
    url,
    headless: argv.headless,
    waitUntil: argv.waitUntil as any,
    navigationTimeoutMs: argv.timeout,
    outputDir: argv.output ? path.resolve(String(argv.output)) : undefined,
    viewports: parseViewports(argv.viewports),
    additionalWaitMs: argv.wait,
    blockPatterns: argv.block?.split(",").map(s => s.trim()).filter(Boolean),
    styles: stylesMode === "off" ? undefined : {
      mode: stylesMode as any,
      selectors: argv.selectors ? (argv.selectors as string).split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
      tags: argv.tags ? (argv.tags as string).split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean) : undefined,
      pick: stylesPick || undefined,
      maxElements: argv["max-elements"]
    }
  };

  const res = await runAudit(opts);
  const where = path.join(res.outputDir, "report.json");
  console.log(`\n✅ Done. Report: ${where}`);
  if (fs.existsSync(where)) {
    console.log(`   Screenshots: ${path.join(res.outputDir, "screenshots")}`);
  }
  // Print diagnostics summary if available
  if (res.diagnostics && (res.diagnostics.missingBasePath?.length || res.diagnostics.contentTypeMismatches?.length)) {
    console.log("\nDiagnostics:");
    if (res.diagnostics.missingBasePath?.length) {
      console.log(` - Missing '/app3' prefix suspected for ${res.diagnostics.missingBasePath.length} asset(s):`);
      for (const row of res.diagnostics.missingBasePath.slice(0, 10)) {
        console.log(`   • ${row.url} -> try ${row.suggestedUrl}`);
      }
      if (res.diagnostics.missingBasePath.length > 10) {
        console.log(`   ...and ${res.diagnostics.missingBasePath.length - 10} more`);
      }
    }
  }
}

async function runCrawl() {
  const start = (argv["start-urls"] || "")
    .split(",").map((s: string) => s.trim()).filter(Boolean);

  const stylesMode = argv["styles-mode"];
  const stylesPick = argv["styles-pick"] === "all"
    ? "all"
    : (argv["styles-pick"] ? (argv["styles-pick"] as string).split(",").map((s: string) => s.trim()).filter(Boolean) : undefined);

  const crawlOpts: CrawlOptions = {
    startUrls: start,
    sameOrigin: argv["same-origin"],
    maxPages: argv["max-pages"],
    concurrency: argv["concurrency"],
    delayMs: argv["crawl-delay"],
    sitemapUrl: argv["sitemap"],
    audit: {
      headless: argv.headless,
      waitUntil: argv.waitUntil as any,
      navigationTimeoutMs: argv.timeout,
      outputDir: argv.output ? path.resolve(String(argv.output)) : undefined,
      viewports: parseViewports(argv.viewports),
      additionalWaitMs: argv.wait,
      blockPatterns: argv.block?.split(",").map(s => s.trim()).filter(Boolean),
      styles: stylesMode === "off" ? undefined : {
        mode: stylesMode as any,
        selectors: argv.selectors ? (argv.selectors as string).split(",").map((s: string) => s.trim()).filter(Boolean) : undefined,
        tags: argv.tags ? (argv.tags as string).split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean) : undefined,
        pick: stylesPick || undefined,
        maxElements: argv["max-elements"]
      }
    }
  };

  const { runDir, summary } = await crawlAndAudit(crawlOpts);
  console.log(`\n🌐 Crawl complete. Summary: ${path.join(runDir, "crawl-summary.json")}`);
  console.log(`   Pages audited: ${summary.totalPages}`);
}

async function main() {
  if (argv.crawl) {
    await runCrawl();
  } else {
    const urlArg = argv._[0] ? String(argv._[0]) : "";
    if (!urlArg) {
      console.error("Please pass a URL or use --crawl with --start-urls/--sitemap");
      process.exit(2);
    }
    await runSingle(urlArg);
  }
}

main().catch(err => {
  console.error("❌ Failed:", err?.stack || err);
  process.exit(1);
});
