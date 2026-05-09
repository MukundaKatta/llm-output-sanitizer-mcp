// Ambient types for @mukundakatta/llm-output-sanitizer, which ships as
// pure JS. Mirrors the API documented in the upstream README.
declare module '@mukundakatta/llm-output-sanitizer' {
  export type Sink = 'markdown' | 'html' | 'sql' | 'shell';

  export interface SanitizerFinding {
    kind: 'html' | 'sql' | 'shell' | string;
    match: string;
  }

  export interface SanitizerResult {
    safe: boolean;
    text: string;
    findings: SanitizerFinding[];
  }

  export function sanitizeOutput(
    text: string,
    options?: { sink?: Sink },
  ): SanitizerResult;

  export function assertSafeOutput(
    text: string,
    options?: { sink?: Sink },
  ): string;
}
