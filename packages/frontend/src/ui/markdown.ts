/**
 * Lightweight markdown renderer for chat log messages.
 * Supports: **bold**, *italic*, `inline code`, - bullet lists, newlines.
 * XSS-safe: all text nodes are set via textContent, never innerHTML.
 */
export function renderMarkdown(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const lines = text.split(/\r?\n/);

  lines.forEach((line, i) => {
    if (i > 0) fragment.appendChild(document.createElement('br'));

    if (/^[-*] /.test(line)) {
      const span = document.createElement('span');
      span.className = 'md-li';
      span.appendChild(document.createTextNode('\u2022 '));
      appendInline(span, line.slice(2));
      fragment.appendChild(span);
    } else {
      appendInline(fragment, line);
    }
  });

  return fragment;
}

// Bold must be checked before italic so ** isn't split as two *
const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

function appendInline(parent: Node, text: string): void {
  const parts = text.split(INLINE_RE);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const el = document.createElement('strong');
      el.textContent = part.slice(2, -2);
      parent.appendChild(el);
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      const el = document.createElement('em');
      el.textContent = part.slice(1, -1);
      parent.appendChild(el);
    } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const el = document.createElement('code');
      el.textContent = part.slice(1, -1);
      parent.appendChild(el);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

/**
 * Strip markdown markers to produce plain text for PixiJS canvas rendering.
 * Converts bullet markers to • for readability.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')  // **bold** → bold
    .replace(/\*([^*\n]+)\*/g, '$1')        // *italic* → italic
    .replace(/`([^`\n]+)`/g, '$1')          // `code` → code
    .replace(/^#{1,6} /gm, '')              // # headers → no prefix
    .replace(/^[-*] /gm, '\u2022 ');        // - item → • item
}
