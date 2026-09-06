from pathlib import Path

path = Path('/home/ubuntu/New140869/app.css')
source = path.read_text()
start = source.find('/* Quick Control Center — Lambo Grey prototype')
if start == -1:
    print('legacy quick-control CSS not found')
else:
    cleaned = source[:start].rstrip() + '\n'
    path.write_text(cleaned)
    print('removed legacy quick-control CSS block')
