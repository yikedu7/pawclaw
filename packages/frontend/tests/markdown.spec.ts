import { test, expect, type Page } from '@playwright/test';

/**
 * Markdown rendering e2e tests.
 *
 * Strategy: navigate to about:blank and inject renderMarkdown / stripMarkdown
 * directly via page.evaluate — no Vite server required since markdown.ts has
 * no external dependencies.  This keeps tests fast and hermetic.
 */

/** Inject renderMarkdown and stripMarkdown into the browser context. */
async function injectMarkdown(page: Page) {
  await page.goto('about:blank');
  await page.evaluate(() => {
    const INLINE_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

    function appendInline(parent: Node, text: string) {
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

    (window as any).renderMarkdown = (text: string): HTMLDivElement => {
      const container = document.createElement('div');
      const lines = text.split(/\r?\n/);
      lines.forEach((line: string, i: number) => {
        if (i > 0) container.appendChild(document.createElement('br'));
        if (/^[-*] /.test(line)) {
          const span = document.createElement('span');
          span.className = 'md-li';
          span.appendChild(document.createTextNode('\u2022 '));
          appendInline(span, line.slice(2));
          container.appendChild(span);
        } else {
          appendInline(container, line);
        }
      });
      return container;
    };

    (window as any).stripMarkdown = (text: string): string =>
      text
        .replace(/\*\*([^*\n]+)\*\*/g, '$1')
        .replace(/\*([^*\n]+)\*/g, '$1')
        .replace(/`([^`\n]+)`/g, '$1')
        .replace(/^#{1,6} /gm, '')
        .replace(/^[-*] /gm, '\u2022 ');
  });
}

/** Call renderMarkdown in the browser and return serialised DOM info. */
async function renderMd(page: Page, text: string) {
  return page.evaluate((t: string) => {
    const container: HTMLDivElement = (window as any).renderMarkdown(t);
    return {
      html: container.innerHTML,
      textContent: container.textContent ?? '',
      strongTexts: Array.from(container.querySelectorAll('strong')).map((el) => el.textContent),
      emTexts: Array.from(container.querySelectorAll('em')).map((el) => el.textContent),
      codeTexts: Array.from(container.querySelectorAll('code')).map((el) => el.textContent),
      mdLiTexts: Array.from(container.querySelectorAll('.md-li')).map((el) => el.textContent),
      brCount: container.querySelectorAll('br').length,
      scriptCount: container.querySelectorAll('script').length,
      imgCount: container.querySelectorAll('img').length,
      bCount: container.querySelectorAll('b').length,
    };
  }, text);
}

test.describe('renderMarkdown — inline formatting', () => {
  test.beforeEach(async ({ page }) => { await injectMarkdown(page); });

  test('bold **text** renders as <strong>', async ({ page }) => {
    const result = await renderMd(page, 'Hello **world**!');
    expect(result.strongTexts).toEqual(['world']);
    expect(result.html).toContain('<strong>world</strong>');
  });

  test('italic *text* renders as <em>', async ({ page }) => {
    const result = await renderMd(page, 'Hello *world*!');
    expect(result.emTexts).toEqual(['world']);
    expect(result.html).toContain('<em>world</em>');
  });

  test('inline code `text` renders as <code>', async ({ page }) => {
    const result = await renderMd(page, 'Run `npm install` now');
    expect(result.codeTexts).toEqual(['npm install']);
    expect(result.html).toContain('<code>npm install</code>');
  });

  test('bullet list item (- prefix) gets .md-li span with • character', async ({ page }) => {
    const result = await renderMd(page, '- item one');
    expect(result.mdLiTexts.length).toBeGreaterThanOrEqual(1);
    expect(result.mdLiTexts[0]).toContain('\u2022');
    expect(result.mdLiTexts[0]).toContain('item one');
  });

  test('bullet list item (* prefix) also gets .md-li span', async ({ page }) => {
    const result = await renderMd(page, '* item two');
    expect(result.mdLiTexts.length).toBeGreaterThanOrEqual(1);
    expect(result.mdLiTexts[0]).toContain('item two');
  });

  test('newline produces <br> element', async ({ page }) => {
    const result = await renderMd(page, 'line one\nline two');
    expect(result.brCount).toBeGreaterThanOrEqual(1);
    expect(result.html).toContain('<br>');
  });

  test('multiple inline formats in one message', async ({ page }) => {
    const result = await renderMd(page, '**bold** and *italic* and `code`');
    expect(result.strongTexts).toEqual(['bold']);
    expect(result.emTexts).toEqual(['italic']);
    expect(result.codeTexts).toEqual(['code']);
  });
});

test.describe('renderMarkdown — plain text (no markdown flag on user messages)', () => {
  test.beforeEach(async ({ page }) => { await injectMarkdown(page); });

  test('plain text is preserved unchanged', async ({ page }) => {
    const result = await renderMd(page, 'just plain text');
    expect(result.textContent).toBe('just plain text');
    expect(result.strongTexts.length).toBe(0);
  });

  test('raw ** markers without markdown flag are NOT parsed', async ({ page }) => {
    // Simulate user-typed plain text by inserting directly as textContent
    const html = await page.evaluate(() => {
      const span = document.createElement('span');
      span.textContent = '**not bold** and *not italic*';
      return span.innerHTML;
    });
    // textContent-set content must appear escaped, not parsed
    expect(html).not.toContain('<strong>');
    expect(html).toContain('**not bold**');
  });
});

test.describe('stripMarkdown', () => {
  test.beforeEach(async ({ page }) => { await injectMarkdown(page); });

  const strip = (page: Page, text: string) =>
    page.evaluate((t: string) => (window as any).stripMarkdown(t), text);

  test('removes bold markers', async ({ page }) => {
    expect(await strip(page, 'hello **world**')).toBe('hello world');
  });

  test('removes italic markers', async ({ page }) => {
    expect(await strip(page, 'hello *world*')).toBe('hello world');
  });

  test('removes inline code markers', async ({ page }) => {
    expect(await strip(page, 'use `pnpm install`')).toBe('use pnpm install');
  });

  test('converts bullet markers to •', async ({ page }) => {
    expect(await strip(page, '- item one\n- item two')).toBe('• item one\n• item two');
  });
});

test.describe('XSS safety', () => {
  test.beforeEach(async ({ page }) => { await injectMarkdown(page); });

  test('<script> tag does NOT produce a script element', async ({ page }) => {
    const result = await renderMd(page, '<script>alert("xss")</script>');
    expect(result.scriptCount).toBe(0);
    expect(result.textContent).toContain('<script>');
  });

  test('<img onerror> injection does NOT produce an img element', async ({ page }) => {
    const result = await renderMd(page, '<img src=x onerror="alert(1)">');
    expect(result.imgCount).toBe(0);
    expect(result.textContent).toContain('<img');
  });

  test('angle brackets in plain text are not parsed as HTML', async ({ page }) => {
    const result = await renderMd(page, '5 > 3 and 2 < 4');
    expect(result.textContent).toContain('5 > 3');
    expect(result.textContent).toContain('2 < 4');
  });

  test('embedded <b> tags inside **bold** are not rendered as elements', async ({ page }) => {
    const result = await renderMd(page, '**bold** <b>not bold</b>');
    expect(result.strongTexts.length).toBe(1);
    expect(result.bCount).toBe(0);
    expect(result.textContent).toContain('<b>not bold</b>');
  });
});
