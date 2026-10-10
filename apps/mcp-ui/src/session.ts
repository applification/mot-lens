import type { App } from '@modelcontextprotocol/ext-apps';

export type SessionScope = { isCurrent: () => boolean; contextSettled: Promise<void> };

// One owner for async report/selection work and conversation context ordering.
// Already-sent host requests cannot be recalled. Their replacement runs next;
// superseded queued work and completion callbacks never publish.
export class ReportSession {
  private generation = 0;
  private active = true;
  private contextQueue: Promise<void> = Promise.resolve();
  constructor(private readonly host: Pick<App, 'updateModelContext'>) {}
  capture(): SessionScope {
    const generation = this.generation;
    return { isCurrent: () => this.active && generation === this.generation, contextSettled: this.contextQueue };
  }
  replaceContext(text: string, onShared?: () => void, onError?: () => void): SessionScope {
    this.generation++;
    const scope = this.capture();
    this.contextQueue = this.contextQueue.catch(() => {}).then(async () => {
      if (!scope.isCurrent()) return;
      try {
        await this.host.updateModelContext({ content: [{ type: 'text', text }] });
        if (scope.isCurrent()) onShared?.();
      } catch { if (scope.isCurrent()) onError?.(); }
    });
    return this.capture();
  }
  close() { this.active = false; this.generation++; }
}
