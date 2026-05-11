import { useState } from 'react';
import type { ScopeResult } from '../types';
import { RouteChip } from './atoms';

type Props = {
  scope: ScopeResult;
  /** When defined, renders a "Think harder ✦" link that re-runs with tier='smart'. */
  onThinkHarder?: () => void;
  /** True while the parent is fetching a re-scope. */
  thinking?: boolean;
};

const CLAUDE_URL = 'https://claude.ai/new';
const CHATGPT_URL = 'https://chatgpt.com/';

export default function MobilizePanel({ scope, onThinkHarder, thinking }: Props) {
  const [copied, setCopied] = useState<'prompt' | null>(null);

  if (scope.route === 'unset') return null;

  const confidenceColor =
    scope.confidence === 'high' ? '#6B8A6E' : scope.confidence === 'medium' ? '#7A7066' : '#B36447';

  function copyPrompt() {
    if (!scope.research_prompt) return;
    navigator.clipboard.writeText(scope.research_prompt).then(() => {
      setCopied('prompt');
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div className="mt-4 rounded-card border border-stoop-hairline bg-stoop-panel-warm/60 px-4 py-3.5">
      <div className="flex items-center gap-2 text-[12px] text-stoop-muted">
        <RouteChip route={scope.route} />
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 6, background: confidenceColor }} />
        <span className="capitalize">{scope.confidence} confidence</span>
        <span className="flex-1" />
        {onThinkHarder && (
          <button
            type="button"
            className="text-[12px] text-stoop-muted hover:text-stoop-ink hover:underline"
            onClick={onThinkHarder}
            disabled={thinking}
          >
            {thinking ? '✦ thinking…' : 'Think harder ✦'}
          </button>
        )}
      </div>

      {scope.next_action && (
        <p className="mt-2.5 text-[14px] leading-snug text-stoop-ink">
          {scope.next_action}
        </p>
      )}

      {/* Primary CTA per route */}
      {(scope.route === 'outsource' || scope.route === 'buy' || scope.route === 'schedule') &&
        scope.service_url && (
          <div className="mt-3">
            <a
              href={scope.service_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex text-[13px]"
            >
              {primaryCtaLabel(scope.route, scope.service_url)} ↗
            </a>
          </div>
        )}

      {scope.route === 'research' && scope.research_prompt && (
        <div className="mt-3 space-y-2.5">
          <pre className="whitespace-pre-wrap break-words rounded-card border border-stoop-hairline bg-stoop-panel p-3 text-[12.5px] leading-relaxed text-stoop-ink-soft">
            {scope.research_prompt}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copyPrompt} className="btn-primary text-[12.5px]">
              {copied === 'prompt' ? 'Copied ✓' : 'Copy prompt'}
            </button>
            <a
              href={CLAUDE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline text-[12.5px]"
            >
              Open Claude.ai ↗
            </a>
            <a
              href={CHATGPT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline text-[12.5px]"
            >
              Open ChatGPT ↗
            </a>
          </div>
        </div>
      )}

      {scope.alternates.length > 0 && (
        <div className="mt-3.5">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            Alternates
          </div>
          <ul className="space-y-1.5">
            {scope.alternates.map((alt, i) => (
              <li key={i} className="text-[13px] text-stoop-ink-soft">
                {alt.url ? (
                  <a
                    href={alt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {alt.label} ↗
                  </a>
                ) : (
                  alt.label
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function primaryCtaLabel(route: 'outsource' | 'buy' | 'schedule', url: string): string {
  try {
    const host = new URL(url).host.replace(/^www\./, '');
    if (host.includes('taskrabbit')) return 'Open in TaskRabbit';
    if (host.includes('amazon')) return 'Open in Amazon';
    if (host.includes('instacart')) return 'Open in Instacart';
    if (host.includes('handy')) return 'Open in Handy';
    if (host.includes('thumbtack')) return 'Open in Thumbtack';
    return `Open ${host}`;
  } catch {
    if (route === 'buy') return 'Open store';
    if (route === 'schedule') return 'Open booking';
    return 'Open service';
  }
}
