export type ViewportSpec = { width: number; height: number; name?: string };

export type StylePick =
  | "all"
  | string[];

export interface StyleCaptureOptions {
  mode: "all" | "selectors" | "tags";
  selectors?: string[];
  tags?: string[];
  pick?: StylePick;
  maxElements?: number;
}

export interface AuditOptions {
  url: string;
  headless?: boolean;
  waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2";
  navigationTimeoutMs?: number;
  viewports?: ViewportSpec[];
  outputDir?: string;
  styles?: StyleCaptureOptions;
  additionalWaitMs?: number;
  blockPatterns?: string[];
}

export interface ConsoleItem {
  type: "log" | "warn" | "error" | "debug" | "info";
  text: string;
  location?: { url?: string; lineNumber?: number; columnNumber?: number };
}

export interface NetworkFailure {
  url: string;
  errorText: string;
  method: string;
  resourceType?: string;
}

export interface HttpIssue {
  url: string;
  status: number;
}

export interface NetworkResponseRow {
  url: string;
  status: number;
  method?: string;
  resourceType?: string;
  contentType?: string;
}

export interface StyleDump {
  element: string;
  index: number;
  bbox?: { x: number; y: number; width: number; height: number };
  styles: Record<string, string>;
}

export interface ViewportResult {
  viewport: ViewportSpec;
  screenshotPath?: string;
  styleDump?: StyleDump[];
}

export interface AuditResult {
  startedAt: string;
  finishedAt: string;
  url: string;
  outputDir: string;
  console: {
    errors: ConsoleItem[];
    warnings: ConsoleItem[];
    logs: ConsoleItem[];
    pageErrors: string[];
  };
  network: {
    failures: NetworkFailure[];
    httpIssues: HttpIssue[];
    responses: NetworkResponseRow[];
  };
  viewports: ViewportResult[];
  diagnostics?: {
    missingBasePath?: Array<{ url: string; suggestedUrl: string; status?: number; contentType?: string; verifiedStatus?: number; verifiedOk?: boolean }>;
    contentTypeMismatches?: Array<{ url: string; expectedExt: string; contentType?: string }>;
  };
}

export interface CrawlOptions {
  startUrls: string[];
  sameOrigin?: boolean;
  maxPages?: number;
  concurrency?: number;
  delayMs?: number;
  sitemapUrl?: string;
  audit: Omit<AuditOptions, "url">;
}

export interface CrawlSummary {
  startedAt: string;
  finishedAt: string;
  totalPages: number;
  pages: Array<{
    url: string;
    outputDir: string;
    consoleErrors: number;
    httpIssues: number;
    networkFailures: number;
    screenshots: string[];
  }>;
}
