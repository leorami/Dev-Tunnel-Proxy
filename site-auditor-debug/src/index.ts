import fs from "node:fs";
import path from "node:path";
import puppeteer, { Browser, HTTPResponse, Page, HTTPRequest } from "puppeteer";
import {
  AuditOptions,
  AuditResult,
  ConsoleItem,
  HttpIssue,
  NetworkFailure,
  ViewportResult,
  StyleDump
} from "./types.js";

const DEFAULT_VIEWPORTS = [
  { width: 375, height: 812, name: "mobile" },
  { width: 768, height: 1024, name: "tablet" },
  { width: 1280, height: 800, name: "laptop" },
  { width: 1440, height: 900, name: "desktop" }
];

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function timestampDir(base?: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = base ? path.resolve(base, stamp) : path.resolve(process.cwd(), "site-auditor", stamp);
  ensureDir(dir);
  ensureDir(path.join(dir, "screenshots"));
  return dir;
}

function attachCapture(page: Page, acc: AuditResult) {
  page.on("console", msg => {
    const item: ConsoleItem = {
      type: msg.type() as ConsoleItem["type"],
      text: msg.text(),
      location: msg.location?.()
    };
    if (item.type === "error") acc.console.errors.push(item);
    else if (item.type === "warn") acc.console.warnings.push(item);
    else acc.console.logs.push(item);
  });

  page.on("pageerror", err => acc.console.pageErrors.push(String((err as any)?.message || err)));

  page.on("requestfailed", req => {
    acc.network.failures.push({
      url: req.url(),
      errorText: req.failure()?.errorText || "unknown",
      method: req.method(),
      resourceType: req.resourceType()
    } as NetworkFailure);
  });

  page.on("response", (res: HTTPResponse) => {
    const s = res.status();
    if (s >= 400) acc.network.httpIssues.push({ url: res.url(), status: s } as HttpIssue);
  });
}

async function applyRequestBlocking(page: Page, patterns: string[]) {
  if (!patterns.length) return;
  await page.setRequestInterception(true);
  page.on("request", req => {
    const url = req.url();
    if (patterns.some(p => url.includes(p))) return req.abort();
    req.continue();
  });
}

function expectedContentTypeForUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const p = u.pathname.toLowerCase();
    if (p.endsWith('.svg')) return 'image/svg+xml';
    if (p.endsWith('.png')) return 'image/png';
    if (p.endsWith('.jpg') || p.endsWith('.jpeg')) return 'image/jpeg';
    if (p.endsWith('.webp')) return 'image/webp';
    if (p.endsWith('.gif')) return 'image/gif';
  } catch {}
  return undefined;
}

async function captureStyles(page: Page, options: AuditOptions): Promise<StyleDump[] | undefined> {
  const stylesOpt = options.styles;
  if (!stylesOpt) return;

  return page.evaluate((stylesOptIn) => {
    const { mode, selectors, tags, maxElements } = stylesOptIn;
    const pick = stylesOptIn.pick === "all" ? "all" : (stylesOptIn.pick as string[] | undefined);

    const pickProps = (cs: CSSStyleDeclaration): Record<string, string> => {
      if (pick === "all") {
        const obj: Record<string, string> = {};
        for (let i = 0; i < cs.length; i++) {
          const prop = cs.item(i);
          obj[prop] = cs.getPropertyValue(prop);
        }
        return obj;
      } else {
        const keep = pick && pick.length ? pick : [
          "display","visibility","opacity","position","z-index",
          "background-image","background-color","color","font-family",
          "font-size","font-weight","line-height","border","border-radius",
          "box-shadow","width","height","margin","padding"
        ];
        const obj: Record<string, string> = {};
        for (const prop of keep) obj[prop] = cs.getPropertyValue(prop);
        return obj;
      }
    };

    let elements: Element[] = [];
    if (mode === "all") {
      elements = Array.from(document.querySelectorAll("*"));
    } else if (mode === "selectors") {
      for (const sel of selectors || []) elements.push(...Array.from(document.querySelectorAll(sel)));
    } else if (mode === "tags") {
      for (const t of tags || []) elements.push(...Array.from(document.getElementsByTagName(t)));
    }

    const limited = elements.slice(0, Math.max(0, maxElements ?? 200));
    return limited.map((el, index) => {
      const cs = getComputedStyle(el as Element);
      const rect = (el as Element).getBoundingClientRect();
      const descriptor = (() => {
        const parts: string[] = [(el as Element).tagName.toLowerCase()];
        const id = (el as HTMLElement).id;
        if (id) parts.push(`#${id}`);
        const className = (el as HTMLElement).className || "";
        if (className) {
          for (const c of String(className).split(/\s+/).filter(Boolean)) parts.push(`.${c}`);
        }
        return parts.join("");
      })();

      return {
        element: descriptor,
        index,
        bbox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        styles: pickProps(cs)
      } as any;
    });
  }, stylesOpt);
}

export async function runAudit(opts: AuditOptions): Promise<AuditResult> {
  const startedAt = new Date().toISOString();
  const outputDir = timestampDir(opts.outputDir);
  const screenshotsDir = path.join(outputDir, "screenshots");

  const result: AuditResult = {
    startedAt,
    finishedAt: "",
    url: opts.url,
    outputDir,
    console: { errors: [], warnings: [], logs: [], pageErrors: [] },
    network: { failures: [], httpIssues: [], responses: [] },
    viewports: [],
    diagnostics: { missingBasePath: [], contentTypeMismatches: [] }
  };

  const headless = opts.headless ?? true;
  const waitUntil = opts.waitUntil ?? "networkidle2";
  const navTimeout = opts.navigationTimeoutMs ?? 45000;
  const vps = (opts.viewports && opts.viewports.length ? opts.viewports : DEFAULT_VIEWPORTS);

  const browser: Browser = await puppeteer.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(navTimeout);
    page.setDefaultNavigationTimeout(navTimeout);
    if (opts.blockPatterns?.length) await applyRequestBlocking(page, opts.blockPatterns);
    attachCapture(page, result);

    // Capture all responses and check for likely missing basePath
    page.on('response', async (res: HTTPResponse) => {
      try{
        const req: HTTPRequest = res.request();
        const url = res.url();
        const status = res.status();
        const method = req.method();
        const resourceType = req.resourceType();
        const headers = res.headers();
        const contentType = headers['content-type'];
        const location = headers['location'];
        result.network.responses.push({ url, status, method, resourceType, contentType });

        // Heuristic: if the site is under /app3 and a request to 
        // "/icons/..." or "/art/..." returns 404 (or 3xx to /app3) without the prefix,
        // suggest retrying with "/app3" prepended.
        try {
          const u = new URL(url);
          const path = u.pathname || "";
          const isAsset = /\.(png|jpg|jpeg|svg|webp|gif)(?:\?|$)/i.test(path);
          const looksRedirectToPrefixed = status >= 300 && status < 400 && typeof location === 'string' && /\/app3\//.test(location) && !path.startsWith('/app3/');
          const looksMissingPrefix = isAsset && (status >= 400 || looksRedirectToPrefixed) && !path.startsWith("/app3/");
          const expectedCt = expectedContentTypeForUrl(url);
          const ctMismatch = isAsset && expectedCt && contentType && !contentType.toLowerCase().includes(expectedCt);
          if (looksMissingPrefix || (ctMismatch && !path.startsWith('/app3/'))) {
            const suggestedUrl = `${u.origin}/app3${path}${u.search || ''}`;
            // Optionally verify the suggestion without blocking audit flow
            try {
              const verify = await fetch(suggestedUrl, { method: 'HEAD' });
              result.diagnostics!.missingBasePath!.push({ url, suggestedUrl, status, contentType, verifiedStatus: verify.status, verifiedOk: verify.ok });
            } catch {
              result.diagnostics!.missingBasePath!.push({ url, suggestedUrl, status, contentType });
            }
          }

          // Log content-type mismatches for awareness
          if (ctMismatch) {
            result.diagnostics!.contentTypeMismatches!.push({ url, expectedExt: expectedCt!, contentType });
          }
        } catch {}
      }catch{}
    });

    for (const vp of vps) {
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
      await page.goto(opts.url, { waitUntil, timeout: navTimeout });
      if (opts.additionalWaitMs) {
        await new Promise(resolve => setTimeout(resolve, opts.additionalWaitMs));
      }

      const filename = `${vp.name || `${vp.width}x${vp.height}`}.png`;
      const outPath = path.join(screenshotsDir, filename);
      await page.screenshot({ path: outPath as any, fullPage: true });
      const styleDump = await captureStyles(page, opts);

      result.viewports.push({
        viewport: vp,
        screenshotPath: outPath,
        styleDump
      } as ViewportResult);
    }

    const reportPath = path.join(outputDir, "report.json");
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
  } finally {
    await browser.close();
  }

  result.finishedAt = new Date().toISOString();
  return result;
}
