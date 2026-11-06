#!/usr/bin/env python3
"""An opt-in, LOCAL-ONLY nginx static-upstream reproduction.

Not a deployed RC2, not Docker Desktop, not an owner Mac test. Creates two
localhost HTTP servers and one isolated nginx subprocess on random high ports;
does not edit /etc/hosts, bind public ports, contact a remote service or change
owner runtime. Proves an unchanged static upstream does not follow a server
that moves from one loopback IP to another. Always cleans up processes.
Run manually: python3 tests/research/rc2-nginx-static-upstream-repro.py
Requirements: local nginx, Python 3.8+, 127.0.0.2 loopback alias supported.
"""
import http.server
import pathlib
import re
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'backend-ok')
    def log_message(self, *_):
        return

class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True

def free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Even a local fixture must never follow a remote Location.
        return None

def status(url):
    # Never accept an arbitrary URL: this research tool may only contact its
    # two exact loopback fixtures, on unprivileged ports, at the fixed path.
    if not isinstance(url, str):
        return 'NON_LOOPBACK_DENIED'
    match = re.fullmatch(r'http://127[.]0[.]0[.][12]:([0-9]{4,5})/api', url)
    if not match or not 1024 <= int(match.group(1)) <= 65535:
        return 'NON_LOOPBACK_DENIED'
    # urllib.request.urlopen() obeys HTTP(S)_PROXY. A misleading global
    # proxy could otherwise route our supposed local-only probe externally.
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect()
    )
    try:
        with opener.open(url, timeout=2) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code
    except Exception:
        return 'CONNECTION_FAILED'

def start_server(address, port):
    server = Server((address, port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

def main():
    backend_port = free_port()
    proxy_port = free_port()
    servers = []
    nginx = None
    with tempfile.TemporaryDirectory(prefix='devproxy-nginx-static-') as temp:
        d = pathlib.Path(temp)
        (d / 'conf').mkdir()
        (d / 'conf' / 'nginx.conf').write_text(
            f'pid {d}/nginx.pid;\n'
            'worker_processes 1;\n'
            f'error_log {d}/error.log info;\n'
            'events { worker_connections 128; }\n'
            'http {\n'
            '  access_log off;\n'
            f'  upstream config_api_upstream {{ server 127.0.0.1:{backend_port}; keepalive 2; }}\n'
            f'  server {{ listen 127.0.0.1:{proxy_port};'
            '    location = /api { proxy_pass http://config_api_upstream; } }\n'
            '}\n'
        )
        try:
            old = start_server('127.0.0.1', backend_port)
            servers.append(old)
            nginx = subprocess.Popen(
                ['nginx', '-p', str(d) + '/', '-c', 'conf/nginx.conf', '-g', 'daemon off;'],
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
            )
            time.sleep(.35)
            if nginx.poll() is not None:
                raise RuntimeError('isolated nginx fixture could not start')
            url = f'http://127.0.0.1:{proxy_port}/api'
            before = status(url)
            old.shutdown()
            old.server_close()
            servers.remove(old)
            new = start_server('127.0.0.2', backend_port)
            servers.append(new)
            time.sleep(.1)
            direct = status(f'http://127.0.0.2:{backend_port}/api')
            stale = status(url)
            new.shutdown()
            new.server_close()
            servers.remove(new)
            restored = start_server('127.0.0.1', backend_port)
            servers.append(restored)
            time.sleep(.1)
            recovered = status(url)
            alive = nginx.poll() is None
            print('NGINX_STATIC_UPSTREAM_LOCAL_FIXTURE')
            print('old upstream:', before)
            print('replacement at different loopback IP:', direct)
            print('unchanged nginx sees stale address:', stale)
            print('restore old backend at same IP:', recovered)
            print('nginx process untouched:', alive)
            assert (before, direct, stale, recovered, alive) == (200, 200, 502, 200, True)
        finally:
            for server in servers:
                server.shutdown()
                server.server_close()
            if nginx and nginx.poll() is None:
                nginx.terminate()
                try:
                    nginx.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    nginx.kill()
                    nginx.wait()

if __name__ == '__main__':
    main()
