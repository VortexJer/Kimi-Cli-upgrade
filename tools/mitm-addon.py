from mitmproxy import http, ctx
import json

LOG_FILE = None

def load(loader):
    loader.add_option(
        name="logfile",
        typespec=str,
        default="",
        help="Path to log file"
    )

def configure(updated):
    global LOG_FILE
    if "logfile" in updated:
        LOG_FILE = ctx.options.logfile

def log_line(line):
    print(line)
    if LOG_FILE:
        with open(LOG_FILE, 'a') as f:
            f.write(line + '\n')

def request(flow: http.HTTPFlow) -> None:
    log_line(f"REQUEST {flow.request.method} {flow.request.pretty_url}")
    for k, v in flow.request.headers.items():
        log_line(f"  {k}: {v}")
    if flow.request.content:
        try:
            body = flow.request.content.decode('utf-8', errors='replace')
            log_line(f"  BODY: {body[:2000]}")
        except Exception as e:
            log_line(f"  BODY: <binary, {len(flow.request.content)} bytes>")

def response(flow: http.HTTPFlow) -> None:
    log_line(f"RESPONSE {flow.response.status_code} {flow.request.pretty_url}")
    if flow.response.content:
        try:
            body = flow.response.content.decode('utf-8', errors='replace')
            log_line(f"  BODY: {body[:2000]}")
        except Exception as e:
            log_line(f"  BODY: <binary, {len(flow.response.content)} bytes>")

def tls_failed_client(data):
    log_line(f"TLS FAILED CLIENT: {data}")

def tls_failed_server(data):
    log_line(f"TLS FAILED SERVER: {data}")
