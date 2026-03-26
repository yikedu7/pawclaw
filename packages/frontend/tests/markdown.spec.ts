import { test, expect } from '@playwright/test';

/**
 * Markdown rendering e2e tests for ChatLog + renderMarkdown.
 *
 * Strategy: navigate to index.html so that Vite's dev server processes and
 * caches the full module graph (main.ts → ChatLog.ts → markdown.ts).  After
 * that, dynamic import('/src/ui/markdown.ts') and import('/src/ui/ChatLog.ts')
 * succeed because Vite has already transformed those files.
 *
 * We intercept the network early to avoid WS/auth errors blocking the page, but
 * the module-level code (imports) still runs so Vite registers the transforms.
 */

async function loadPageAndModules(page: import('@playwright/test').Page) {
  // Intercept the WS connection to avoid unhandled WebSocket errors
  await page.route('**/ws**', (route) => route.abort());
  await page.route('**/api/**', (route) => route.fulfill({ status: 401, body: '{}' }));

  // Navigate to index.html — this causes main.ts (and all transitive imports,
  // including ChatLog.ts and markdown.ts) to be fetched and transformed by Vite.
  await page.goto('/');

  // Inject a module script that stores the two modules on window so tests can
  // reach them.  By now Vite has the transforms cached; the import() resolves.
  await page.addScriptTag({
    type: 'module',
    content: `
      const md = await import('/src/ui/markdown.ts');
      window.__renderMarkdown = md.renderMarkdown;
      window.__stripMarkdown  = md.stripMarkdown;
      window.__modulesReady = true;
    `,
  });

  // Wait until the script above has completed
  await page.waitForFunction(() => (window as any).__modulesReady === true, { timeout: 10_000 });
}

// Helper: call renderMarkdown in the browser and return serialised DOM info
async function renderMd(page: import('@playwright/test').Page, text: string) {
  return page.evaluate((t: string) => {
    const renderMarkdown = (window as any).__renderMarkdown as (s: string) => DocumentFragment;
    const frag = renderMarkdown(t);
    const div = document.createElement('div');
    div.appendChild(frag);
    return {
      html: div.innerHTML,
      textContent: div.textContent ?? '',
      strongTexts: Array.from(div.querySelectorAll('strong')).map((el) => el.textContent),
      emTexts: Array.from(div.querySelectorAll('em')).map((el) => el.textContent),
      codeTexts: Array.from(div.querySelectorAll('code')).map((el) => el.textContent),
      mdLiTexts: Array.from(div.querySelectorAll('.md-li')).map((el) => el.textContent),
      brCount: div.querySelectorAll('br').length,
      scriptCount: div.querySelectorAll('script').length,
      imgCount: div.querySelectorAll('img').length,
      bCount: div.querySelectorAll('b').length,
    };
  }, text);
}

test.describe('renderMarkdown — inline formatting', () => {
  test.beforeEach(async ({ page }) => {
    await loadPageAndModules(page);
  });

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

  test('bullet list item (- prefix) gets bullet prefix span with • character', async ({ page }) => {
    const result = await renderMd(page, '- item one');
    expect(result.mdLiTexts.length).toBeGreaterThanOrEqual(1);
    expect(result.mdLiTexts[0]).toContain('\u2022');
    expect(result.mdLiTexts[0]).toContain('item one');
  });

  test('bullet list item (* prefix) also gets bullet prefix span', async ({ page }) => {
    const result = await renderMd(page, '* item two');
    expect(result.mdLiTexts.length).toBeGreaterThanOrEqual(1);
    expect(result.mdLiTexts[0]).toContain('\u2022');
    expect(result.mdLiTexts[0]).toContain('item two');
  });

  test('newline in text produces <br> element', async ({ page }) => {
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

test.describe('ChatLog — markdown vs plain text', () => {
  test.beforeEach(async ({ page }) => {
    await loadPageAndModules(page);

    // Expose ChatLog on window as well
    await page.addScriptTag({
      type: 'module',
      content: `
        const m = await import('/src/ui/ChatLog.ts');
        window.__ChatLog = m.ChatLog;
        window.__chatLogReady = true;
      `,
    });
    await page.waitForFunction(() => (window as any).__chatLogReady === true, { timeout: 10_000 });
  });

  test('add() with markdown:true (pet speak) renders markdown elements', async ({ page }) => {
    const result = await page.evaluate(() => {
      const ChatLog = (window as any).__ChatLog;
      const log = new ChatLog();
      document.body.appendChild(log.el);

      (log as any).add({
        speaker: 'TestPet',
        text: '**bold** and *italic*',
        time: new Date(),
        markdown: true,
      });

      const textSpan = log.el.querySelector('.chat-text');
      return {
        strong: textSpan?.querySelector('strong')?.textContent ?? null,
        em: textSpan?.querySelector('em')?.textContent ?? null,
        html: textSpan?.innerHTML ?? null,
      };
    });
    expect(result.strong).toBe('bold');
    expect(result.em).toBe('italic');
  });

  test('add() without markdown flag keeps user message as plain text', async ({ page }) => {
    const result = await page.evaluate(() => {
      const ChatLog = (window as any).__ChatLog;
      const log = new ChatLog();
      document.body.appendChild(log.el);

      (log as any).add({
        speaker: 'You',
        text: '**not bold** and *not italic*',
        time: new Date(),
        // No markdown flag — user-typed messages stay plain
      });

      const textSpan = log.el.querySelector('.chat-text');
      return {
        strong: textSpan?.querySelector('strong')?.textContent ?? null,
        em: textSpan?.querySelector('em')?.textContent ?? null,
        textContent: textSpan?.textContent ?? null,
      };
    });
    expect(result.strong).toBeNull();
    expect(result.em).toBeNull();
    expect(result.textContent).toBe('**not bold** and *not italic*');
  });
});

test.describe('XSS safety', () => {
  test.beforeEach(async ({ page }) => {
    await loadPageAndModules(page);
  });

  test('<script> tag in message does NOT produce script element in DOM', async ({ page }) => {
    const result = await renderMd(page, '<script>alert("xss")</script>');
    expect(result.scriptCount).toBe(0);
    // The literal text must be present (escaped), not executed
    expect(result.textContent).toContain('<script>');
  });

  test('<img onerror> injection does NOT produce img element', async ({ page }) => {
    const result = await renderMd(page, '<img src=x onerror="alert(1)">');
    expect(result.imgCount).toBe(0);
    expect(result.textContent).toContain('<img');
  });

  test('plain text with angle brackets is not parsed as HTML', async ({ page }) => {
    const result = await renderMd(page, '5 > 3 and 2 < 4');
    expect(result.textContent).toContain('5 > 3');
    expect(result.textContent).toContain('2 < 4');
  });

  test('embedded HTML tags are not rendered as elements', async ({ page }) => {
    const result = await renderMd(page, '**bold** <b>not bold</b>');
    // Only one <strong> from ** markdown; <b> must NOT become an element
    expect(result.strongTexts.length).toBe(1);
    expect(result.bCount).toBe(0);
    // The raw <b> tag text must appear as literal characters
    expect(result.textContent).toContain('<b>not bold</b>');
  });
});
