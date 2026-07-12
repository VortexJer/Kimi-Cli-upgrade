import json
import os
import subprocess
import time
import glob
import sys

KIMI_EXE = 'C:/Users/Joaquin ERE/.kimi-code/bin/kimi.exe'
KIMI1_SCRIPT = 'C:/Users/Joaquin ERE/kimi-cli-upgrade/bin/kimi1.js'

PROMPTS = [
    'crea una landing page profesional para un estudio de diseño web',
    'añade una seccion portfolio con 4 proyectos de ejemplo',
    'añade un formulario de contacto funcional y mejora el SEO basico'
]

def find_latest_wire(home, workspace_dir):
    dirname = os.path.basename(workspace_dir)
    pattern = os.path.join(home, 'sessions', f'wd_{dirname}_*', 'session_*', 'agents', 'main', 'wire.jsonl')
    candidates = glob.glob(pattern)
    if not candidates:
        return None
    return max(candidates, key=os.path.getmtime)

def extract_session_id(wire_path):
    parts = wire_path.split(os.sep)
    for p in parts:
        if p.startswith('session_'):
            return p
    return None

def run_cmd(cmd, cwd, timeout=300):
    print(f'  Running: {" ".join(cmd)}', flush=True)
    start = time.time()
    try:
        result = subprocess.run(
            cmd, cwd=cwd,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            encoding='utf-8', errors='replace',
            timeout=timeout
        )
        elapsed = time.time() - start
        print(f'  Done in {elapsed:.1f}s, exit={result.returncode}, stdout={len(result.stdout)} chars, stderr={len(result.stderr)} chars', flush=True)
        if result.stderr:
            print(f'  stderr: {result.stderr[:200]}', flush=True)
        return result
    except subprocess.TimeoutExpired:
        print(f'  TIMEOUT after {timeout}s', flush=True)
        return None

def analyze_wire(wire_path):
    total = {'input_other': 0, 'input_cache_read': 0, 'input_cache_creation': 0, 'output': 0, 'requests': 0}
    with open(wire_path, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            try:
                evt = json.loads(line)
                if evt.get('type') == 'usage.record' and isinstance(evt.get('usage'), dict):
                    u = evt['usage']
                    total['input_other'] += u.get('inputOther', 0)
                    total['input_cache_read'] += u.get('inputCacheRead', 0)
                    total['input_cache_creation'] += u.get('inputCacheCreation', 0)
                    total['output'] += u.get('output', 0)
                    total['requests'] += 1
            except:
                pass
    total['total_billed'] = total['input_other'] + total['input_cache_creation'] + total['output']
    return total

def run_sequence(label, workspace_dir, cmd_prefix, home_dir):
    print(f'\n=== {label} ===', flush=True)
    session_id = None
    for i, prompt in enumerate(PROMPTS, 1):
        print(f'\nPrompt {i}/{len(PROMPTS)}: {prompt}', flush=True)
        if session_id:
            cmd = cmd_prefix + ['-S', session_id, '-p', prompt, '--output-format', 'text']
        else:
            cmd = cmd_prefix + ['-p', prompt, '--output-format', 'text']
        result = run_cmd(cmd, workspace_dir)
        if result is None:
            print('  Skipping rest due to timeout', flush=True)
            break
        time.sleep(1)
        wire = find_latest_wire(home_dir, workspace_dir)
        if wire:
            session_id = extract_session_id(wire)
            print(f'  Session: {session_id}', flush=True)
    
    wire = find_latest_wire(home_dir, workspace_dir)
    if wire:
        stats = analyze_wire(wire)
        print(f'\n  FINAL {label}:', flush=True)
        print(f'    wire: {wire}', flush=True)
        print(f'    requests: {stats["requests"]}', flush=True)
        print(f'    inputOther: {stats["input_other"]:,}', flush=True)
        print(f'    inputCacheRead: {stats["input_cache_read"]:,}', flush=True)
        print(f'    output: {stats["output"]:,}', flush=True)
        print(f'    TOTAL billed: {stats["total_billed"]:,}', flush=True)
        return stats
    else:
        print('  No wire found', flush=True)
        return None

def run_sequence_kimi1(label, workspace_dir):
    print(f'\n=== {label} ===', flush=True)
    session_id = None
    for i, prompt in enumerate(PROMPTS, 1):
        print(f'\nPrompt {i}/{len(PROMPTS)}: {prompt}', flush=True)
        if session_id:
            cmd = ['node', KIMI1_SCRIPT, '--preview', '-S', session_id, '-p', prompt]
        else:
            cmd = ['node', KIMI1_SCRIPT, '--preview', prompt]
        result = run_cmd(cmd, workspace_dir)
        if result is None:
            print('  Skipping rest due to timeout', flush=True)
            break
        time.sleep(1)
        wire = find_latest_wire('C:/Users/Joaquin ERE/.kimi-code-kimi1', workspace_dir)
        if wire:
            session_id = extract_session_id(wire)
            print(f'  Session: {session_id}', flush=True)
    
    wire = find_latest_wire('C:/Users/Joaquin ERE/.kimi-code-kimi1', workspace_dir)
    if wire:
        stats = analyze_wire(wire)
        print(f'\n  FINAL {label}:', flush=True)
        print(f'    wire: {wire}', flush=True)
        print(f'    requests: {stats["requests"]}', flush=True)
        print(f'    inputOther: {stats["input_other"]:,}', flush=True)
        print(f'    inputCacheRead: {stats["input_cache_read"]:,}', flush=True)
        print(f'    output: {stats["output"]:,}', flush=True)
        print(f'    TOTAL billed: {stats["total_billed"]:,}', flush=True)
        return stats
    else:
        print('  No wire found', flush=True)
        return None

def main():
    stats_kimi = run_sequence(
        'kimi.exe oficial',
        'C:/Users/Joaquin ERE/Desktop/web-test-kimi-long',
        [KIMI_EXE],
        'C:/Users/Joaquin ERE/.kimi-code'
    )
    stats_kimi1 = run_sequence_kimi1(
        'kimi1 wrapper --preview',
        'C:/Users/Joaquin ERE/Desktop/web-test-kimi1-long'
    )
    
    print('\n=== COMPARISON ===', flush=True)
    if stats_kimi and stats_kimi1:
        print(f'kimi.exe:      {stats_kimi["total_billed"]:,} tokens', flush=True)
        print(f'kimi1 preview: {stats_kimi1["total_billed"]:,} tokens', flush=True)
        diff = stats_kimi1['total_billed'] - stats_kimi['total_billed']
        pct = diff / stats_kimi['total_billed'] * 100
        print(f'difference: {diff:+,} tokens ({pct:+.1f}%)', flush=True)

if __name__ == '__main__':
    main()
