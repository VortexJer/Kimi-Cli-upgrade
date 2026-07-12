import json

wire = 'C:/Users/Joaquin ERE/.kimi-code-kimi1/sessions/wd_web-test-kimi1_47b3385348fc/session_a848e58b-3d05-4c6a-aeca-9b2470a3abf3/agents/main/wire.jsonl'

events = []
with open(wire, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            evt = json.loads(line)
            events.append(evt)
        except:
            pass

# Find Edit events and context around them
for i, evt in enumerate(events):
    if evt.get('type') != 'context.append_loop_event':
        continue
    ev = evt.get('event', {})
    if ev.get('name') != 'tool.execute' and ev.get('name') != 'Edit':
        continue
    tool = ev.get('tool') or ev.get('result', {}).get('tool') or ev.get('name')
    if tool != 'Edit':
        continue
    params = ev.get('parameters', {}) or ev.get('result', {}).get('parameters', {})
    path = params.get('path') or params.get('file_path') or 'unknown'
    print(f'\n=== Edit #{i} on {path} ===')
    # Show previous 3 events for context
    for j in range(max(0, i-3), i):
        prev = events[j]
        if prev.get('type') == 'context.append_loop_event':
            p_ev = prev.get('event', {})
            p_name = p_ev.get('name') or p_ev.get('type') or 'unknown'
            print(f'  before: {p_name}')
    # Show edit details
    print(f'  parameters: {json.dumps(params, ensure_ascii=False)[:500]}')
    # Show next 2 events
    for j in range(i+1, min(len(events), i+3)):
        nxt = events[j]
        if nxt.get('type') == 'context.append_loop_event':
            n_ev = nxt.get('event', {})
            n_name = n_ev.get('name') or n_ev.get('type') or 'unknown'
            print(f'  after: {n_name}')
