"""Playwright interception harness for Status pages.

No listener is started. Every request is intercepted on a fixture origin.
Nothing is sent to the owner app, the network, or a public host.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

FIXTURE_HOST = "devproxy-fixture.invalid"
FIXTURE_ORIGIN = f"https://{FIXTURE_HOST}"
FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "v214_status_synthetic.json"

PAGES = {
    "status": "/status/status.html",
    "health": "/status/health.html",
    "reports": "/status/reports.html",
}


def load_fixture(path: Path = FIXTURE_PATH) -> dict:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    if fixture.get("syntheticOnly") is not True or fixture.get("ownerData") is not False:
        raise RuntimeError("fixture_not_synthetic")
    host = urlparse(fixture.get("proxyUrl", "")).hostname
    if host != "example-tunnel.invalid":
        raise RuntimeError("fixture_proxy_host")
    raw = path.read_text(encoding="utf-8")
    for banned in ("ngrok.app", "localhost", "127.0.0.1"):
        if banned in raw:
            raise RuntimeError("fixture_owner_host")
    return fixture


def routes_document(fixture: dict, conflict_key: str) -> dict:
    summary = {"local-proxy": {}, "ngrok": {}}
    metadata = {}
    for route in fixture["routes"]:
        summary["local-proxy"][route["path"]] = {"status": route["localStatus"]}
        summary["ngrok"][route["path"]] = {"status": route["tunnelStatus"]}
        metadata[route["path"]] = {
            "sourceFile": route["sourceFile"],
            "upstream": route["upstream"],
        }
    conflicts = fixture["conflicts"][conflict_key]
    return {
        "generatedAt": fixture["generatedAt"],
        "ngrok": fixture["proxyUrl"],
        "summary": summary,
        "metadata": metadata,
        "nginxConflicts": {"totalConflicts": conflicts["totalConflicts"]},
        "nginxWarnings": list(conflicts["nginxWarnings"]),
    }


def _status_file(repo: Path, url_path: str) -> Path | None:
    if not url_path.startswith("/status/") or url_path.endswith("/"):
        return None
    rel = url_path[len("/status/"):]
    if not rel or "\\" in rel or rel.startswith("/") or any(part in ("", ".", "..") for part in rel.split("/")):
        return None
    root = (repo / "status").resolve()
    target = (root / rel).resolve()
    if root != target and root not in target.parents:
        return None
    if not target.is_file() or target.is_symlink():
        return None
    return target


def _content_type(path: Path) -> str:
    return {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".md": "text/plain; charset=utf-8",
    }.get(path.suffix, "application/octet-stream")


class StatusBrowser:
    """One intercepted browser context. Safe to open again after close_page."""

    def __init__(self, repo: Path, browser, fixture: dict | None = None):
        self.repo = repo
        self.browser = browser
        self.fixture = fixture if fixture is not None else load_fixture()
        self.context = None
        self.page = None
        self.traffic: list[dict] = []
        self.conflict_key = "ambiguous"

    def open(self, path: str, width: int, height: int, theme: str, conflict_key: str = "ambiguous"):
        self.close_page()
        self.traffic = []
        self.conflict_key = conflict_key
        self.context = self.browser.new_context(
            viewport={"width": width, "height": height},
            device_scale_factor=1,
            color_scheme=theme,
            locale="en-US",
            timezone_id="UTC",
            service_workers="block",
            accept_downloads=False,
        )
        self.context.add_init_script(
            "localStorage.setItem('dtpTheme', %s); localStorage.setItem('dtpCalliopeOpen', 'false');"
            % json.dumps(theme)
        )
        self.page = self.context.new_page()
        self.page.route("**/*", self._handle)
        self.page.goto(FIXTURE_ORIGIN + path, wait_until="domcontentloaded", timeout=25000)
        self.page.wait_for_function(
            "() => !!document.querySelector('body > header #reloadConfigs')",
            timeout=15000,
        )
        return self.page

    def close_page(self) -> None:
        if self.context is not None:
            self.context.close()
        self.context = None
        self.page = None

    def _handle(self, route) -> None:
        request = route.request
        parsed = urlparse(request.url)
        record = {
            "method": request.method,
            "path": parsed.path or "/",
            "query": parsed.query,
            "outcome": "deny-external",
        }
        fixture = (
            parsed.scheme == "https"
            and parsed.hostname == FIXTURE_HOST
            and parsed.port is None
            and not parsed.username
            and not parsed.password
        )
        if not fixture or request.method not in ("GET", "HEAD"):
            if fixture and request.method not in ("GET", "HEAD"):
                record["outcome"] = "deny-fixture"
            self.traffic.append(record)
            route.abort()
            return
        payload = self._response(parsed.path or "/")
        if payload is None:
            record["outcome"] = "deny-fixture"
            self.traffic.append(record)
            route.abort()
            return
        record["outcome"] = "fulfill"
        self.traffic.append(record)
        content_type, body = payload
        route.fulfill(status=200, content_type=content_type, body=body)

    def _response(self, path: str) -> tuple[str, bytes] | None:
        target = _status_file(self.repo, path)
        if target is not None:
            return _content_type(target), target.read_bytes()
        if path == "/routes.json":
            return "application/json", _json(routes_document(self.fixture, self.conflict_key))
        if path == "/config":
            return "application/json", _json({"apiBasePath": "/devproxy/api", "version": "1.0.0"})
        if path in ("/status.json", "/.artifacts/reports/health-latest.json"):
            return "application/json", _json({"ngrok": self.fixture["proxyUrl"]})
        if path == "/health.json":
            return "application/json", _json({"status": "ok"})
        if path.startswith("/devproxy/api/reports/list"):
            return "application/json", _json({"ok": True, "items": [], "pagination": {"total": 0}})
        if path.startswith("/devproxy/api/"):
            return "application/json", _json({"ok": True})
        return None

    def stamped_route_reads(self) -> list[dict]:
        return [
            item for item in self.traffic
            if item["outcome"] == "fulfill"
            and item["method"] == "GET"
            and item["path"] == "/routes.json"
            and item["query"].startswith("_t=")
            and item["query"][3:].isdigit()
        ]

    def non_get(self) -> list[dict]:
        return [item for item in self.traffic if item["method"] not in ("GET", "HEAD")]

    def external(self) -> list[dict]:
        return [item for item in self.traffic if item["outcome"] == "deny-external"]


def _json(payload: dict) -> bytes:
    return json.dumps(payload).encode("utf-8")
