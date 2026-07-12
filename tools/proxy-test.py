import subprocess
import time
import os
import sys
import urllib.request

repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
log_file = os.path.join(repo_dir, 'proxy-test.log')
proxy_port = 18080
node_path = r'C:\Program Files\nodejs\node.exe'
proxy_script = os.path.join(repo_dir, 'tools', 'proxy-test.js')

# Clear log
open(log_file, 'w').close()

# Start proxy
env = os.environ.copy()
proc = subprocess.Popen(
    [node_path, proxy_script],
    cwd=repo_dir,
    stdout=open(log_file, 'w'),
    stderr=subprocess.STDOUT,
    env=env
)

# Wait for proxy ready
ready = False
for _ in range(20):
    try:
        import socket
        s = socket.create_connection(('localhost', proxy_port), timeout=1)
        s.close()
        ready = True
        break
    except Exception:
        time.sleep(0.2)

if not ready:
    print('Proxy did not start')
    proc.kill()
    sys.exit(1)

print(f'Proxy running on port {proxy_port}. Running kimi with HTTPS_PROXY...')

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
    proc.wait(timeout=2)
except subprocess.TimeoutExpired:
    proc.kill()

print('\nProxy log:')
with open(log_file, 'r') as f:
    print(f.read())
