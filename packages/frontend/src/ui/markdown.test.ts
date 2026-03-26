import { describe, it, expect } from 'vitest';
import { stripMarkdown, renderMarkdown } from './markdown';

describe('stripMarkdown', () => {
  it('removes bold markers', () => {
    expect(stripMarkdown('hello **world**')).toBe('hello world');
  });

  it('removes italic markers', () => {
    expect(stripMarkdown('hello *world*')).toBe('hello world');
  });

  it('removes inline code markers', () => {
    expect(stripMarkdown('use `pnpm install`')).toBe('use pnpm install');
  });

  it('removes heading markers', () => {
    expect(stripMarkdown('# Title\n## Sub')).toBe('Title\nSub');
  });

  it('converts bullet markers to •', () => {
    expect(stripMarkdown('- item one\n- item two')).toBe('• item one\n• item two');
  });

  it('handles mixed formatting', () => {
    expect(stripMarkdown('**bold** and *italic* with `code`')).toBe('bold and italic with code');
  });

  it('returns plain text unchanged', () => {
    expect(stripMarkdown('just plain text')).toBe('just plain text');
  });
});

describe('renderMarkdown', () => {
  function fragmentToHtml(frag: DocumentFragment): string {
    const div = document.createElement('div');
    div.appendChild(frag);
    return div.innerHTML;
  }

  it('renders bold', () => {
    const html = fragmentToHtml(renderMarkdown('hello **world**'));
    expect(html).toContain('<strong>world</strong>');
    expect(html).toContain('hello ');
  });

  it('renders italic', () => {
    const html = fragmentToHtml(renderMarkdown('hello *world*'));
    expect(html).toContain('<em>world</em>');
  });

  it('renders inline code', () => {
    const html = fragmentToHtml(renderMarkdown('run `pnpm install`'));
    expect(html).toContain('<code>pnpm install</code>');
  });

  it('renders bullet list items', () => {
    const html = fragmentToHtml(renderMarkdown('- item one\n- item two'));
    expect(html).toContain('• item one');
    expect(html).toContain('• item two');
    expect(html).toContain('class="md-li"');
  });

  it('renders newlines as <br>', () => {
    const html = fragmentToHtml(renderMarkdown('line one\nline two'));
    expect(html).toContain('<br>');
  });

  it('does not XSS-inject via bold markers', () => {
    const html = fragmentToHtml(renderMarkdown('**<script>alert(1)</script>**'));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not XSS-inject via plain text', () => {
    const html = fragmentToHtml(renderMarkdown('<img src=x onerror=alert(1)>'));
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
