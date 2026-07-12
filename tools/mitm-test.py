import subprocess
import time
import os
import sys
import threading

repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
proxy_port = 18080
mitm_path = os.path.join(repo_dir, '.venv', 'Scripts', 'mitmdump.exe')
addon_script = os.path.join(repo_dir, 'tools', 'mitm-addon.py')

if not os.path.exists(mitm_path):
    print(f'mitmdump not found at {mitm_path}')
    sys.exit(1)

# Start mitmproxy, capture stdout
env = os.environ.copy()
proc = subprocess.Popen(
    [mitm_path, '-p', str(proxy_port), '-s', addon_script, '--set', f'logfile={os.path.join(repo_dir, "mitm-test.log")}'],
    cwd=repo_dir,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
    text=True,
    env=env
)

# Collect output in a thread
output_lines = []
def read_output():
    for line in proc.stdout:
        output_lines.append(line)
        print(f'[mitmdump] {line}', end='')
thread = threading.Thread(target=read_output, daemon=True)
thread.start()

# Wait for proxy ready
ready = False
for _ in range(30):
    try:
        import socket
        s = socket.create_connection(('localhost', proxy_port), timeout=1)
        s.close()
        ready = True
        break
    except Exception:
        time.sleep(0.3)

if not ready:
    print('mitmproxy did not start')
    proc.terminate()
    sys.exit(1)

print(f'mitmproxy running on port {proxy_port}. Running kimi with HTTPS_PROXY...')

# Run kimi with proxy
kimi_path = subprocess.run(['where.exe', 'kimi'], capture_output=True, text=True).stdout.strip().split('\n')[0]
run_env = env.copy()
run_env['HTTPS_PROXY'] = f'http://localhost:{proxy_port}'
run_env['HTTP_PROXY'] = f'http://localhost:{proxy_port}'
run_env['NO_PROXY'] = ''

result = subprocess.run([kimi_path, '-p', 'say hi'], env=run_env)

# Wait for async traffic
time.sleep(4)
proc.terminate()
try:
    proc.wait(timeout=3)
except subprocess.TimeoutExpired:
    proc.kill()

thread.join(timeout=2)

print('\n--- mitmproxy addon log ---')
log_path = os.path.join(repo_dir, 'mitm-test.log')
if os.path.exists(log_path):
    with open(log_path, 'r') as f:
        print(f.read())
else:
    print('No addon log')
