"""Renders the subset of markdown used by ARCHITECTURE.md to print-ready HTML."""
import html
import re
import sys

INLINE = (
    (re.compile(r'`([^`]+)`'), lambda m: f'<code>{html.escape(m.group(1))}</code>'),
    (re.compile(r'\*\*([^*]+)\*\*'), lambda m: f'<strong>{m.group(1)}</strong>'),
    (re.compile(r'(?<![\w`])_([^_]+)_(?![\w`])'), lambda m: f'<em>{m.group(1)}</em>'),
    (re.compile(r'\[([^\]]+)\]\(([^)]+)\)'), lambda m: f'<a href="{m.group(2)}">{m.group(1)}</a>'),
)


def inline(text: str) -> str:
    """Escapes the text, then applies each inline rule in order."""
    out = html.escape(text)
    # Code spans run first so their contents are never treated as emphasis.
    for pattern, repl in INLINE:
        out = pattern.sub(repl, out)
    return out


def cells(row: str) -> list[str]:
    """Splits one table row on the pipe, dropping the empty edges."""
    return [c.strip() for c in row.strip().strip('|').split('|')]


def convert(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if stripped.startswith('```'):
            opened = i + 1
            i += 1
            block = []
            while i < len(lines) and not lines[i].strip().startswith('```'):
                block.append(html.escape(lines[i]))
                i += 1
            # Consuming to the end of the file would emit plausible looking HTML from malformed
            # markdown, and this tool gates a required deliverable.
            if i >= len(lines):
                raise ValueError(f'Unclosed code fence opened on line {opened}.')
            i += 1
            out.append('<pre><code>' + '\n'.join(block) + '</code></pre>')
            continue

        if stripped == '---':
            out.append('<hr>')
            i += 1
            continue

        if stripped.startswith('#'):
            level = len(stripped) - len(stripped.lstrip('#'))
            out.append(f'<h{level}>{inline(stripped[level:].strip())}</h{level}>')
            i += 1
            continue

        # A table is a header row, a separator row of dashes, then body rows.
        if stripped.startswith('|') and i + 1 < len(lines) and set(lines[i + 1].strip()) <= set('|- :'):
            head = cells(stripped)
            i += 2
            body = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                body.append(cells(lines[i]))
                i += 1
            rows = ''.join(
                '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body
            )
            out.append(
                '<table><thead><tr>'
                + ''.join(f'<th>{inline(c)}</th>' for c in head)
                + f'</tr></thead><tbody>{rows}</tbody></table>'
            )
            continue

        if not stripped:
            i += 1
            continue

        para = []
        while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith(('#', '|', '```', '---')):
            para.append(lines[i].strip())
            i += 1
        out.append(f'<p>{inline(" ".join(para))}</p>')

    return '\n'.join(out)


if __name__ == '__main__':
    body = convert(open(sys.argv[1], encoding='utf-8').read())
    css = open(sys.argv[2], encoding='utf-8').read()
    print(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}</style></head>'
          f'<body>{body}</body></html>')
