#!/usr/bin/env python3
"""Render the reviewed Status document in a browser with a synthetic fixture.

No listener is started. Every request is intercepted. The pages are
SOURCE_RECONSTRUCTED_PREVIEW frames for the Origin artifact extractor.
They are not the owner app, not owner data, and not owner UAT.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

FIXTURE_HOST = "devproxy-fixture.invalid"
FIXTURE_ORIGIN = f"https://{FIXTURE_HOST}"
PAGE_PATH = "/status/status.html"
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PNG_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*\.png$")
PNG_SIG = bytes.fromhex("89504e470d0a1a0a")

V213_TESTED_TREE = "6e05877b076f9edc188382622cd4912abec7ed17"
V214_ENGINEER_TIP = "63854b07c6b71945b5eb415441d17112ff10ba5b"
EXPECTED_STATUS_TREE = "8c45bf494cd95401b6a82330e24b0b237ce5e28d"
CHANGED_FROM_V213 = (
    "status/common.css",
    "status/common.js",
    "status/health.html",
    "status/reports.html",
    "status/status.html",
)
EXPECTED_BLOBS = {
    "status/status.html": "765584fef92244a02e8d919d89ca2eb86f05c520",
    "status/common.js": "121ea9440a357fb79b8e896b5ae9cbef4f69acb3",
    "status/common.css": "e2da6231d921893311bda441be3a0161454bd72a",
    "status/health.html": "cdc245be0ddbef49d5171f8d15a89bfdce6c4bef",
    "status/reports.html": "08e84d0398894b3b7f11520b9e3b7fd10d207d07",
    "status/config.js": "bd858c04942a6756dd43180830120463fe5eea5c",
    "status/vendor/lucide.min.js": "0123783f406f3141429457cf42d6afe86f01486d",
    "status/vendor/marked.min.js": "e12b0fab1b958792f45849d31abb3cdecc012d1b",
    "status/vendor/purify.min.js": "54a70fe024a729c6ef4a0a5d3557918063d5afad",
    "status/vendor/LICENSES.md": "ad6313d517e03d1a118dcc022244e88d693d0513",
    "status/assets/calliope_heart_stethoscope.svg": "d033ebbc47906ba8bc605803d258f00d14bc3579",
    "status/assets/favicon.png": "90a043995a2276f4424d2bebbf23327c88d4cc08",
    "status/assets/favicon.svg": "cf365c9a574b623fbd5c25e5dde5c43159bb65a1",
    "status/assets/logo.svg": "0d7f7fad5172097a687544267f556298ca378e2e",
}
LINE_ANCHORS = {
    "status/status.html": {
        2917: "Last scan",
        2918: "Last scan only; not live health",
        3097: "async function reloadConfigs()",
        3112: "Report re-read",
        3279: "Historical conflict report dismissed",
    },
    "status/common.js": {
        76: "headerRefreshStatus",
        83: "registerHeaderRefresh",
        143: "replaceWith(h)",
        195: "inert",
    },
    "status/common.css": {
        557: "V161 mobile header",
        564: "display: grid",
        695: "translateY(calc(100% + 24px))",
    },
    "status/health.html": {
        100: 'id="observed-health"',
        108: "Last scan only; not live health",
    },
    "status/reports.html": {
        54: 'id="reportCleanup"',
        55: "Clean up old reports",
    },
}
API_PATHS = {
    "/config",
    "/routes.json",
    "/status.json",
    "/.artifacts/reports/health-latest.json",
    "/devproxy/api/ai/health",
    "/devproxy/api/ai/thoughts",
    "/devproxy/api/ai/stats",
    "/devproxy/api/promotions",
    "/devproxy/api/overrides/conflicts",
    "/devproxy/api/settings/auto-scan",
    "/devproxy/api/notifications",
    "/health.json",
    "/devproxy/api/reports/list",
}
FRAMES = (
    {"file": "status-desktop-light-drawer-open.png", "width": 1365, "height": 900,
     "theme": "light", "state": "drawer-open", "conflicts": "ambiguous", "page": "status"},
    {"file": "status-desktop-dark.png", "width": 1365, "height": 900,
     "theme": "dark", "state": "drawer-closed", "conflicts": "ambiguous", "page": "status"},
    {"file": "status-mobile-light-drawer-closed.png", "width": 390, "height": 844,
     "theme": "light", "state": "drawer-closed", "conflicts": "ambiguous", "page": "status"},
    {"file": "status-430-light.png", "width": 430, "height": 844,
     "theme": "light", "state": "drawer-closed", "conflicts": "ambiguous", "page": "status"},
    {"file": "status-320-light.png", "width": 320, "height": 844,
     "theme": "light", "state": "drawer-closed", "conflicts": "ambiguous", "page": "status"},
    {"file": "status-desktop-light-conflicts-decoded.png", "width": 1365, "height": 900,
     "theme": "light", "state": "conflicts-decoded", "conflicts": "decoded", "page": "status"},
    {"file": "status-desktop-light-report-reread.png", "width": 1365, "height": 900,
     "theme": "light", "state": "report-reread", "conflicts": "ambiguous", "page": "status"},
    {"file": "status-mobile-light-conflicts.png", "width": 390, "height": 844,
     "theme": "light", "state": "conflict-scrolled", "conflicts": "ambiguous", "page": "status"},
    {"file": "health-mobile-light.png", "width": 390, "height": 844,
     "theme": "light", "state": "header", "conflicts": "ambiguous", "page": "health"},
    {"file": "health-mobile-dark.png", "width": 390, "height": 844,
     "theme": "dark", "state": "header", "conflicts": "ambiguous", "page": "health"},
    {"file": "health-desktop-light-missing.png", "width": 1365, "height": 900,
     "theme": "light", "state": "report-missing", "conflicts": "ambiguous", "page": "health",
     "health": "missing"},
    {"file": "reports-mobile-light-empty.png", "width": 390, "height": 844,
     "theme": "light", "state": "empty", "conflicts": "ambiguous", "page": "reports", "reports": "empty"},
    {"file": "reports-mobile-dark-empty.png", "width": 390, "height": 844,
     "theme": "dark", "state": "empty", "conflicts": "ambiguous", "page": "reports", "reports": "empty"},
    {"file": "reports-430-light-populated.png", "width": 430, "height": 844,
     "theme": "light", "state": "populated", "conflicts": "ambiguous", "page": "reports", "reports": "populated"},
    {"file": "reports-mobile-light-failed.png", "width": 390, "height": 844,
     "theme": "light", "state": "failed", "conflicts": "ambiguous", "page": "reports", "reports": "failed"},
    {"file": "reports-desktop-light-cleanup.png", "width": 1365, "height": 900,
     "theme": "light", "state": "cleanup-open", "conflicts": "ambiguous", "page": "reports", "reports": "populated"},
)


class CaptureError(RuntimeError):
    """The synthetic capture is not safe to publish."""


def classify_request(method: str, url: str) -> str:
    """Return fulfill, deny-fixture, or deny-external. Never contacts the network."""
    parsed = urlparse(url)
    if parsed.username or parsed.password or parsed.fragment:
        return "deny-external"
    fixture = (
        parsed.scheme == "https"
        and parsed.hostname == FIXTURE_HOST
        and parsed.port is None
    )
    if not fixture:
        return "deny-external"
    if method not in ("GET", "HEAD"):
        return "deny-fixture"
    path = parsed.path or "/"
    if path != PAGE_PATH and path not in API_PATHS and not _status_rel(path):
        return "deny-fixture"
    if method == "HEAD":
        return "deny-fixture"
    query = parsed.query
    reports_list = path == "/devproxy/api/reports/list" and re.fullmatch(r"page=\d{1,4}&limit=\d{1,4}", query or "")
    if query and not re.fullmatch(r"_t=\d{1,16}", query) and not reports_list:
        return "deny-fixture"
    return "fulfill"


def _status_rel(path: str) -> str | None:
    if not path.startswith("/status/") or path.endswith("/"):
        return None
    rel = path[len("/status/"):]
    if not rel or "\\" in rel or rel.startswith("/") or any(part in ("", ".", "..") for part in rel.split("/")):
        return None
    return rel


def status_file(repo: Path, url_path: str) -> Path | None:
    rel = _status_rel(url_path)
    if rel is None:
        return None
    root = (repo / "status").resolve()
    target = (root / rel).resolve()
    if root != target and root not in target.parents:
        return None
    if not target.is_file() or target.is_symlink():
        return None
    return target


def assert_blob_map(actual: dict, expected: dict) -> None:
    mismatches = sorted(path for path, blob in expected.items() if actual.get(path) != blob)
    if mismatches:
        raise CaptureError("blob_drift:" + ",".join(mismatches))


def git_output(repo: Path, *args: str) -> str:
    import subprocess
    try:
        return subprocess.check_output(["git", "-C", str(repo), *args], text=True, stderr=subprocess.DEVNULL).strip()
    except subprocess.CalledProcessError as error:
        raise CaptureError("git_failed:" + args[0]) from error


def verify_repository(repo: Path) -> str:
    actual = {path: git_output(repo, "hash-object", path) for path in EXPECTED_BLOBS}
    assert_blob_map(actual, EXPECTED_BLOBS)
    head_tree = git_output(repo, "rev-parse", "HEAD:status")
    if head_tree != EXPECTED_STATUS_TREE:
        raise CaptureError("status_tree_drift")
    diff = git_output(repo, "diff", "--name-only", V213_TESTED_TREE, "HEAD", "--", "status")
    changed = tuple(sorted(line for line in diff.splitlines() if line))
    if changed != tuple(sorted(CHANGED_FROM_V213)):
        raise CaptureError("v213_status_diff")
    for rel, anchors in LINE_ANCHORS.items():
        lines = (repo / rel).read_text(encoding="utf-8").splitlines()
        for number, needle in anchors.items():
            if number < 1 or number > len(lines) or needle not in lines[number - 1]:
                raise CaptureError(f"source_anchor_drift:{rel}:{number}")
    head = git_output(repo, "rev-parse", "HEAD")
    if not SHA40.fullmatch(head):
        raise CaptureError("bad_head")
    return head


def load_fixture(path: Path) -> dict:
    fixture = json.loads(path.read_text(encoding="utf-8"))
    if fixture.get("syntheticOnly") is not True or fixture.get("ownerData") is not False:
        raise CaptureError("fixture_not_synthetic")
    host = urlparse(fixture.get("proxyUrl", "")).hostname
    if host != "example-tunnel.invalid":
        raise CaptureError("fixture_proxy_host")
    for route in fixture["routes"]:
        upstream = urlparse(route["upstream"]).hostname or ""
        if not upstream.endswith(".invalid"):
            raise CaptureError("fixture_upstream_host")
        for status in (route["localStatus"], route["tunnelStatus"]):
            if status not in (200, 307, 308, 401, 404, 503):
                raise CaptureError("fixture_status")
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


def json_body(payload: dict) -> bytes:
    return json.dumps(payload).encode("utf-8")


def response_for(
    repo: Path,
    fixture: dict,
    conflict_key: str,
    path: str,
    health: str = "ok",
    reports: str = "empty",
) -> tuple[str, bytes] | None:
    target = status_file(repo, path)
    if target is not None:
        kind = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".md": "text/plain; charset=utf-8",
        }.get(target.suffix, "application/octet-stream")
        return kind, target.read_bytes()
    bodies = {
        "/config": ("application/json", json_body({"apiBasePath": "/devproxy/api", "version": "1.0.0"})),
        "/routes.json": ("application/json", json_body(routes_document(fixture, conflict_key))),
        "/status.json": ("application/json", json_body({"ngrok": fixture["proxyUrl"]})),
        "/.artifacts/reports/health-latest.json": ("application/json", json_body({"ngrok": fixture["proxyUrl"]})),
        "/devproxy/api/ai/health": ("application/json", json_body({
            "enabled": True, "healthy": True, "mode": "local_documentation", "activity": "idle",
        })),
        "/devproxy/api/ai/thoughts": ("application/json", json_body({"events": []})),
        "/devproxy/api/ai/stats": ("application/json", json_body({"exists": False, "chunks": 0})),
        "/devproxy/api/promotions": ("application/json", json_body({"ok": True, "promotions": {}})),
        "/devproxy/api/overrides/conflicts": ("application/json", json_body({"conflicts": []})),
        "/devproxy/api/settings/auto-scan": ("application/json", json_body({
            "ok": True, "settings": {"enabled": False, "intervalSeconds": 60},
        })),
        "/devproxy/api/notifications": ("application/json", json_body({"ok": True})),
        "/health.json": ("application/json", json_body({"status": "ok"})),
    }
    if health == "missing" and path in {
        "/health.json", "/routes.json", "/status.json", "/.artifacts/reports/health-latest.json",
    }:
        return None
    if path == "/devproxy/api/reports/list":
        if reports == "failed":
            return "application/json", json_body({"ok": False, "error": "reports_unavailable"})
        if reports == "populated":
            return "application/json", json_body({
                "ok": True,
                "items": [{"name": "health-synthetic.json", "size": 128, "mtimeMs": 1762144381466}],
                "pagination": {"total": 1},
            })
        return "application/json", json_body({"ok": True, "items": [], "pagination": {"total": 0}})
    return bodies.get(path)


def record_denial(denied: list, method: str, url: str) -> str:
    kind = classify_request(method, url)
    if kind == "fulfill":
        raise CaptureError("record_called_for_allowed_request")
    if kind == "deny-fixture":
        denied.append({"method": method, "origin": FIXTURE_ORIGIN, "path": urlparse(url).path or "/"})
    return kind


def png_size(raw: bytes) -> tuple[int, int]:
    import struct
    if len(raw) < 33 or raw[:8] != PNG_SIG or raw[12:16] != b"IHDR":
        raise CaptureError("invalid_png")
    return struct.unpack(">II", raw[16:24])


def build_manifest(source_sha: str, frames: list, **extra) -> dict:
    if not SHA40.fullmatch(source_sha):
        raise CaptureError("bad_source_sha")
    if extra.get("served_sha", source_sha) != source_sha:
        raise CaptureError("source_served_mismatch")
    if not frames or len(frames) > 16:
        raise CaptureError("invalid_frames")
    seen = set()
    for frame in frames:
        name = frame.get("file")
        if not isinstance(name, str) or not PNG_NAME.fullmatch(name) or name in seen:
            raise CaptureError("unsafe_frame_name")
        seen.add(name)
        if frame.get("kind") != "SOURCE_RECONSTRUCTED_PREVIEW":
            raise CaptureError("frame_kind")
        if not SHA256.fullmatch(str(frame.get("sha256"))):
            raise CaptureError("frame_hash")
        if frame.get("width", 0) <= 0 or frame.get("height", 0) <= 0:
            raise CaptureError("frame_dimensions")
    manifest = {
        "syntheticOnly": True,
        "testedSourceSha": source_sha,
        "servedSha": source_sha,
        "framework": "web",
        "macosRunnerAvailable": False,
        "kind": "SOURCE_RECONSTRUCTED_PREVIEW",
        "ownerData": False,
        "statusDocumentBlob": EXPECTED_BLOBS["status/status.html"],
        "v213TestedTree": V213_TESTED_TREE,
        "v214EngineerTip": V214_ENGINEER_TIP,
        "dependencyBlobs": dict(EXPECTED_BLOBS),
        "fixtureSha256": extra["fixture_sha256"],
        "deniedRequests": extra.get("denied_requests", []),
        "deniedExternalCount": extra.get("denied_external_count", 0),
        "frames": frames,
    }
    for item in manifest["deniedRequests"]:
        if item.get("origin") != FIXTURE_ORIGIN:
            raise CaptureError("denied_request_left_fixture_origin")
    return manifest


def source_snippets(repo: Path) -> str:
    def block(rel: str, start: int, end: int) -> str:
        lines = (repo / rel).read_text(encoding="utf-8").splitlines()
        body = "\n".join(f"{number}|{lines[number - 1]}" for number in range(start, end + 1))
        return f"### {rel} blob `{EXPECTED_BLOBS[rel]}` lines {start}-{end}\n\n```\n{body}\n```\n"

    return "\n".join([
        "# Source excerpts for the synthetic Status render",
        "",
        "Classification: `SOURCE_RECONSTRUCTED_PREVIEW`.",
        "These lines are the reviewed Status document and its tested dependencies.",
        "`testedSourceSha=servedSha` in the manifest is the evidence commit that rendered this fixture, not the mixed owner tree.",
        "",
        block("status/status.html", 3097, 3114),
        block("status/status.html", 3277, 3280),
        block("status/common.js", 76, 84),
        block("status/health.html", 96, 108),
        block("status/reports.html", 52, 58),
        block("status/common.css", 687, 696),
        "",
        "The visible header refresh stays an icon. Feedback is the separate header status.",
        "Health separates the observed endpoint from the historical scan.",
        "Reports cleanup stays inside a closed disclosure until the person opens it.",
        "",
    ])


def _wait_ready(page, frame: dict) -> None:
    page.wait_for_function(
        "() => !!document.querySelector('body > header #reloadConfigs')",
        timeout=15000,
    )
    if frame.get("page", "status") == "status":
        page.wait_for_function(
            """() => {
              const apps = document.querySelector('#apps');
              if (!apps || apps.textContent.startsWith('Error:')) return false;
              return !!apps.querySelector('.app')
                && document.body.innerText.includes('Last scan only; not live health')
                && document.body.innerText.includes('Reported conflicts');
            }""",
            timeout=25000,
        )
        if frame["conflicts"] == "decoded":
            page.wait_for_function(
                "() => document.body.innerText.includes('Decoded route details: 1') && document.body.innerText.includes('Reported path:')",
                timeout=10000,
            )
        else:
            page.wait_for_function(
                """() => document.body.innerText.includes('Decoded route details: 0')
                  && document.body.innerText.includes('Some conflict details unavailable or ambiguous.')""",
                timeout=10000,
            )
        opened = frame["state"] == "drawer-open"
        page.wait_for_function(
            """(opened) => {
              const drawer = document.getElementById('aiDrawer');
              if (!drawer) return false;
              const collapsed = drawer.classList.contains('collapsed');
              return opened ? !collapsed : collapsed;
            }""",
            arg=opened,
            timeout=10000,
        )
        if frame["state"] == "conflict-scrolled":
            page.locator("#conflictCard").scroll_into_view_if_needed()
        if frame["state"] == "report-reread":
            page.locator("body > header #reloadConfigs").click()
            page.wait_for_function(
                "() => (document.getElementById('headerRefreshStatus').textContent || '').includes('Report re-read')",
                timeout=8000,
            )
    elif frame.get("page") == "health":
        if frame.get("health") == "missing":
            page.wait_for_function(
                """() => {
                  const observed = document.getElementById('observed-health');
                  const conflicts = document.getElementById('scan-conflicts');
                  return !!observed && /unavailable/i.test(observed.textContent)
                    && !!conflicts && /unknown/i.test(conflicts.textContent);
                }""",
                timeout=15000,
            )
        else:
            page.wait_for_function(
                "() => document.body.innerText.includes('example-tunnel.invalid') && document.body.innerText.includes('Responding')",
                timeout=15000,
            )
    elif frame.get("page") == "reports":
        if frame.get("reports") == "failed":
            page.wait_for_function("() => document.body.innerText.includes('Could not load reports')", timeout=15000)
        elif frame.get("reports") == "populated":
            page.wait_for_function("() => document.body.innerText.includes('health-synthetic.json')", timeout=15000)
        else:
            page.wait_for_function("() => document.body.innerText.includes('No reports found')", timeout=15000)
        if frame["state"] == "cleanup-open":
            page.locator("#reportCleanup").evaluate("el => { el.open = true }")
    theme = page.evaluate("() => document.documentElement.getAttribute('data-theme')")
    if theme != frame["theme"]:
        raise CaptureError("theme_not_applied")


def capture(repo: Path, fixture_path: Path, output_dir: Path, source_sha: str) -> dict:
    head = verify_repository(repo)
    if source_sha != head:
        raise CaptureError("head_source_mismatch")
    fixture = load_fixture(fixture_path)
    fixture_sha = hashlib.sha256(fixture_path.read_bytes()).hexdigest()
    if output_dir.exists():
        raise CaptureError("output_exists")
    from playwright.sync_api import sync_playwright

    denied: list = []
    denied_external = 0
    images = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            for frame in FRAMES:
                context = browser.new_context(
                    viewport={"width": frame["width"], "height": frame["height"]},
                    device_scale_factor=1,
                    color_scheme=frame["theme"],
                    locale="en-US",
                    timezone_id="UTC",
                    service_workers="block",
                    accept_downloads=False,
                )
                opened = "true" if frame["state"] == "drawer-open" else "false"
                context.add_init_script(
                    "localStorage.setItem('dtpTheme', %s);"
                    "localStorage.setItem('dtpCalliopeOpen', %s);"
                    % (json.dumps(frame["theme"]), json.dumps(opened))
                )
                page = context.new_page()

                def make_handler(spec: dict):
                    def handle(route):
                        nonlocal denied_external
                        request = route.request
                        kind = classify_request(request.method, request.url)
                        if kind != "fulfill":
                            record_denial(denied, request.method, request.url)
                            if kind == "deny-external":
                                denied_external += 1
                            route.abort()
                            return
                        path = urlparse(request.url).path
                        if spec.get("health") == "missing" and path in {
                            "/health.json",
                            "/routes.json",
                            "/status.json",
                            "/.artifacts/reports/health-latest.json",
                        }:
                            route.abort()
                            return
                        payload = response_for(
                            repo,
                            fixture,
                            spec["conflicts"],
                            path,
                            spec.get("health", "ok"),
                            spec.get("reports", "empty"),
                        )
                        if payload is None:
                            record_denial(denied, request.method, request.url)
                            route.abort()
                            return
                        content_type, body = payload
                        route.fulfill(status=200, content_type=content_type, body=body)
                    return handle

                page.route("**/*", make_handler(frame))
                page_path = {
                    "status": "/status/status.html",
                    "health": "/status/health.html",
                    "reports": "/status/reports.html",
                }[frame.get("page", "status")]
                page.goto(FIXTURE_ORIGIN + page_path, wait_until="domcontentloaded", timeout=25000)
                _wait_ready(page, frame)
                if frame["state"] != "report-reread":
                    page.wait_for_timeout(400)
                raw = page.screenshot(type="png", animations="disabled", caret="hide")
                width, height = png_size(raw)
                if (width, height) != (frame["width"], frame["height"]):
                    raise CaptureError(f"viewport_mismatch:{frame['file']}:{width}x{height}")
                visible = page.locator("body").inner_text()
                if "ngrok.app" in visible or "127.0.0.1" in visible:
                    raise CaptureError("owner_host_visible")
                shows_proxy = frame.get("page", "status") != "reports" and frame.get("state") != "report-missing"
                if shows_proxy and "example-tunnel.invalid" not in visible:
                    raise CaptureError("synthetic_proxy_not_visible")
                images[frame["file"]] = (raw, width, height)
                context.close()
        finally:
            browser.close()

    frames = []
    for spec in FRAMES:
        raw, width, height = images[spec["file"]]
        frames.append({
            "file": spec["file"],
            "width": width,
            "height": height,
            "sha256": hashlib.sha256(raw).hexdigest(),
            "theme": spec["theme"],
            "kind": "SOURCE_RECONSTRUCTED_PREVIEW",
            "viewport": {"width": spec["width"], "height": spec["height"]},
            "dpr": 1,
            "state": spec["state"],
        })
    manifest = build_manifest(
        source_sha,
        frames,
        served_sha=source_sha,
        fixture_sha256=fixture_sha,
        denied_requests=denied,
        denied_external_count=denied_external,
    )
    output_dir.mkdir(parents=True, exist_ok=False)
    for name, (raw, _width, _height) in images.items():
        os.chmod(output_dir, 0o700)
        target = output_dir / name
        target.write_bytes(raw)
        os.chmod(target, 0o644)
    (output_dir / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (output_dir / "SNIPPETS.md").write_text(source_snippets(repo), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--fixture", type=Path, default=Path("scripts/visuals/fixtures/v214_status_synthetic.json"))
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    repo = args.repo.resolve()
    fixture = args.fixture if args.fixture.is_absolute() else repo / args.fixture
    manifest = capture(repo, fixture, args.output_dir, args.source_sha)
    print(json.dumps({
        "result": "SOURCE_RECONSTRUCTED_PREVIEW",
        "testedSourceSha": manifest["testedSourceSha"],
        "frames": len(manifest["frames"]),
        "deniedExternalCount": manifest["deniedExternalCount"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
