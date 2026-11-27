"""Playwright interception harness for Status pages.

No listener is started. Every request is intercepted on a fixture origin.
Nothing is sent to the owner app, the network, or a public host.
"""
from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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


def _dashboard_file(repo: Path, url_path: str) -> Path | None:
    if url_path not in ("/dashboard", "/dashboard/", "/dashboard/index.html"):
        return None
    root = (repo / "dashboard" / "public").resolve()
    target = (root / "index.html").resolve()
    if target.is_symlink() or not target.is_file():
        return None
    if root != target and root not in target.parents:
        return None
    return target


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
        self.health_mode = "ok"
        self.routes_mode = "report"
        self.status_mode = "present"
        self.reports_mode = "empty"
        self.fail_stamped = False
        self.status_generated_at = None
        self.hold_once = []
        self.held_routes = []

    def open(
        self,
        path: str,
        width: int,
        height: int,
        theme: str,
        conflict_key: str = "ambiguous",
        health: str = "ok",
        routes: str = "report",
        status_json: str = "present",
        reports: str = "empty",
        status_at: str | None = None,
        hold_once: tuple[str, ...] = (),
        ready: str = "header",
    ):
        self.close_page()
        self.traffic = []
        self.conflict_key = conflict_key
        self.health_mode = health
        self.routes_mode = routes
        self.status_mode = status_json
        self.reports_mode = reports
        self.fail_stamped = False
        self.status_generated_at = status_at
        self.hold_once = list(hold_once)
        self.held_routes = []
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
        if ready == "header":
            self.page.wait_for_function(
                "() => !!document.querySelector('body > header #reloadConfigs')",
                timeout=15000,
            )
        elif ready == "dashboard":
            self.page.wait_for_function(
                "() => !!document.querySelector('body > header #themeToggle')",
                timeout=15000,
            )
        elif ready != "dom":
            raise RuntimeError("unknown_ready_mode")
        return self.page

    def close_page(self) -> None:
        for item in list(self.held_routes):
            try:
                item["route"].abort()
            except Exception:
                pass
        self.held_routes = []
        if self.context is not None:
            self.context.close()
        self.context = None
        self.page = None

    def release_held(self, path_prefix: str, *, body: bytes, content_type: str = "application/json", status: int = 200) -> int:
        keep = []
        released = 0
        for item in self.held_routes:
            matched = item["path"] == path_prefix or item["path"].startswith(path_prefix)
            if not matched:
                keep.append(item)
                continue
            item["route"].fulfill(status=status, content_type=content_type, body=body)
            item["record"]["outcome"] = "fulfill"
            released += 1
        self.held_routes = keep
        return released

    def _take_hold(self, path: str) -> bool:
        for index, item in enumerate(self.hold_once):
            prefix = item[:-1] if item.endswith("*") else None
            if (prefix is not None and path.startswith(prefix)) or path == item:
                del self.hold_once[index]
                return True
        return False

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
        if self._take_hold(parsed.path or "/"):
            record["outcome"] = "held"
            self.traffic.append(record)
            self.held_routes.append({"path": parsed.path or "/", "route": route, "record": record})
            return
        if (
            self.fail_stamped
            and (parsed.path or "/") == "/routes.json"
            and (parsed.query or "").startswith("_t=")
        ):
            record["outcome"] = "deny-fixture"
            self.traffic.append(record)
            route.abort()
            return
        payload = self._response(parsed.path or "/", parsed.query or "")
        if payload is None:
            record["outcome"] = "deny-fixture"
            self.traffic.append(record)
            route.abort()
            return
        record["outcome"] = "fulfill"
        self.traffic.append(record)
        content_type, body = payload
        route.fulfill(status=200, content_type=content_type, body=body)

    def _response(self, path: str, query: str = "") -> tuple[str, bytes] | None:
        target = _status_file(self.repo, path)
        if target is not None:
            return _content_type(target), target.read_bytes()
        dashboard = _dashboard_file(self.repo, path)
        if dashboard is not None:
            return _content_type(dashboard), dashboard.read_bytes()
        if path == "/routes.json":
            if self.routes_mode == "missing":
                return None
            if self.routes_mode == "invalid":
                return "application/json", b"{"
            document = routes_document(self.fixture, self.conflict_key)
            if self.routes_mode == "zero":
                document["nginxConflicts"] = {"totalConflicts": 0}
                document["nginxWarnings"] = []
            elif self.routes_mode == "negative":
                document["nginxConflicts"] = {"totalConflicts": -1}
            elif self.routes_mode == "fraction":
                document["nginxConflicts"] = {"totalConflicts": 1.5}
            elif self.routes_mode == "text":
                document["nginxConflicts"] = {"totalConflicts": "2"}
            elif self.routes_mode == "unsafe":
                raw = _json(document).decode("utf-8").replace(
                    '"totalConflicts": 2',
                    '"totalConflicts": 9007199254740993',
                    1,
                )
                return "application/json", raw.encode("utf-8")
            return "application/json", _json(document)
        if path == "/config":
            return "application/json", _json({"apiBasePath": "/devproxy/api", "version": "1.0.0"})
        if path in ("/status.json", "/.artifacts/reports/health-latest.json"):
            if self.status_mode == "missing":
                return None
            if self.status_mode == "invalid":
                return "application/json", b"{"
            generated = self.status_generated_at or self.fixture["generatedAt"]
            return "application/json", _json({"ngrok": self.fixture["proxyUrl"], "generatedAt": generated})
        if path == "/health.json":
            if self.health_mode == "missing":
                return None
            if self.health_mode == "invalid":
                return "application/json", b"{"
            if self.health_mode == "malformed":
                return "application/json", b"{}"
            if self.health_mode == "not-ok":
                return "application/json", _json({"status": "error"})
            return "application/json", _json({"status": "ok"})
        if path.startswith("/devproxy/api/reports/list"):
            return "application/json", self._reports_body(query)
        if path.startswith("/devproxy/api/"):
            return "application/json", _json({"ok": True})
        return None

    def _reports_body(self, query: str) -> bytes:
        page = (parse_qs(query).get("page") or ["1"])[0]
        mode = self.reports_mode
        if mode == "failed":
            return _json({"ok": False, "error": "reports_unavailable"})
        if mode == "malformed":
            return b"{}"
        if mode == "ok-no-items":
            return _json({"ok": True})
        if mode == "bad-total":
            return _json({"ok": True, "items": [], "pagination": {"total": 1.5}})
        if mode == "negative-total":
            return _json({"ok": True, "items": [], "pagination": {"total": -1}})
        if mode == "unsafe-total":
            return b'{"ok":true,"items":[],"pagination":{"total":9007199254740993}}'
        if mode == "page-gap":
            return _json({"ok": True, "items": [], "pagination": {"total": 25}})
        if mode == "shrunk":
            return _json({"ok": True, "items": [], "pagination": {"total": 0}})
        if mode == "recover-malformed":
            if page == "1":
                return b"{}"
            return _json({"ok": True, "items": [], "pagination": {"total": 0}})
        if mode == "paged":
            items = [
                {"name": f"health-synthetic-{index}.json", "size": 128, "mtimeMs": 1762144381466}
                for index in range(10)
            ]
            return _json({"ok": True, "items": items, "pagination": {"total": 15}})
        if mode == "populated":
            return _json({
                "ok": True,
                "items": [{
                    "name": "health-synthetic.json",
                    "size": 128,
                    "mtimeMs": 1762144381466,
                }],
                "pagination": {"total": 1},
            })
        return _json({"ok": True, "items": [], "pagination": {"total": 0}})

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
