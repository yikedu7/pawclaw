/**
 * Splits a streaming token stream into complete sentences.
 * Buffers partial tokens; emits via onSentence when a boundary is found.
 * Boundaries: . ? ! 。 ？ ！ \n\n
 */
const BOUNDARY_RE = /[.?!。？！]|\n\n/;

export class SentenceDetector {
  private buffer = '';

  constructor(private readonly onSentence: (sentence: string) => void) {}

  push(token: string): void {
    this.buffer += token;
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = BOUNDARY_RE.exec(this.buffer)) !== null) {
      const end = match.index + match[0].length;
      const sentence = this.buffer.slice(0, end).trim();
      if (sentence) this.onSentence(sentence);
      this.buffer = this.buffer.slice(end);
    }
  }

  /** Returns and clears any remaining partial sentence (call on stream end). */
  flush(): string {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining;
  }
}
