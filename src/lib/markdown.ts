import { Fragment, createElement, type ReactNode } from 'react';

// Minimal markdown-to-React renderer for the bounded, known shape of
// docs/methodology-content.md (headings, paragraphs, unordered lists, links,
// bold, inline code). Not a general-purpose markdown parser.

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Order matters: links first, then bold, then inline code, on the remaining
  // plain-text segments only.
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  const pushPlain = (segment: string, keyBase: string) => {
    // bold + inline code within plain segments
    const parts = segment.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter((p) => p !== '');
    parts.forEach((part, idx) => {
      const key = `${keyBase}-${idx}`;
      if (part.startsWith('**') && part.endsWith('**')) {
        nodes.push(createElement('strong', { key }, part.slice(2, -2)));
      } else if (part.startsWith('`') && part.endsWith('`')) {
        nodes.push(createElement('code', { key }, part.slice(1, -1)));
      } else {
        nodes.push(part);
      }
    });
  };

  while ((match = linkRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushPlain(text.slice(lastIndex, match.index), `${keyPrefix}-t${i}`);
    }
    nodes.push(
      createElement(
        'a',
        { key: `${keyPrefix}-a${i}`, href: match[2], target: '_blank', rel: 'noreferrer' },
        match[1],
      ),
    );
    lastIndex = match.index + match[0].length;
    i += 1;
  }
  if (lastIndex < text.length) {
    pushPlain(text.slice(lastIndex), `${keyPrefix}-tail`);
  }
  return nodes;
}

export function renderMarkdown(source: string): ReactNode {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const tag = `h${Math.min(level, 6)}`;
      blocks.push(createElement(tag, { key: key++ }, renderInline(headingMatch[2], `h${key}`)));
      i += 1;
      continue;
    }

    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^-\s+/, ''));
        i += 1;
      }
      blocks.push(
        createElement(
          'ul',
          { key: key++ },
          items.map((item, idx) => createElement('li', { key: idx }, renderInline(item, `li${idx}`))),
        ),
      );
      continue;
    }

    // Paragraph: collect until blank line or next block start.
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^#{1,6}\s/.test(lines[i]) && !/^-\s+/.test(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(createElement('p', { key: key++ }, renderInline(paraLines.join(' '), `p${key}`)));
  }

  return createElement(Fragment, null, blocks);
}

export function fillTemplate(source: string, values: Record<string, string>): string {
  return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole, path: string) => {
    return path in values ? values[path] : whole;
  });
}
