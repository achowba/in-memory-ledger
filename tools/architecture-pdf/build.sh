#!/usr/bin/env bash
# Renders ARCHITECTURE.md to ARCHITECTURE.pdf, the Part 2 deliverable.
#
# The deliverable is a PDF of two to four pages, so the page count is a requirement and not a
# preference. This script prints the count it produced; check it after any edit to the document.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
here="$root/tools/architecture-pdf"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if ! command -v python3 > /dev/null 2>&1; then
  echo "No python3 found. It renders the markdown, and macOS and most Linux ship with it." >&2
  exit 1
fi

chrome=""
for candidate in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "$(command -v google-chrome || true)" \
  "$(command -v chromium || true)"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then chrome="$candidate"; break; fi
done

if [ -z "$chrome" ]; then
  echo "No Chrome or Chromium found. Install one, or render $root/ARCHITECTURE.md by hand." >&2
  exit 1
fi

python3 "$here/md-to-html.py" "$root/ARCHITECTURE.md" "$here/print.css" > "$work/architecture.html"
"$chrome" --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="$root/ARCHITECTURE.pdf" "$work/architecture.html" 2>/dev/null

python3 - "$root/ARCHITECTURE.pdf" <<'PY'
import re
import sys

data = open(sys.argv[1], 'rb').read()
pages = len(re.findall(rb'/Type\s*/Page[^s]', data))
print(f'ARCHITECTURE.pdf: {pages} pages, {len(data) // 1024} KB')
if not 2 <= pages <= 4:
    raise SystemExit(f'The deliverable must be 2 to 4 pages. This is {pages}.')
PY
