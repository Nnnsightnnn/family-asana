import { useEffect, useState } from 'react';
import type { Route } from '../types';
import { Icon, RouteChip } from './atoms';

type Props = {
  onClose: () => void;
};

const TIP_KEY = 'fa.tip.scoping';

const ROUTE_TUTORIAL: Array<{ route: Route; example: string; line: string }> = [
  { route: 'diy',       example: 'Vacuum living room',                       line: 'Routine tasks the family does itself. The panel collapses to a small chip — no friction.' },
  { route: 'delegate',  example: 'School forms for Sam — due Friday',         line: 'Belongs on a different household member\'s plate. AI suggests who, you confirm.' },
  { route: 'outsource', example: 'Deep clean kitchen by Saturday',            line: 'A paid service fits best — opens a deep link to TaskRabbit, Handy, etc.' },
  { route: 'buy',       example: 'Buy more HVAC air filters',                 line: 'The task is actually a purchase. Pre-built Amazon / Instacart search URL.' },
  { route: 'schedule',  example: 'Annual physical with Kaiser',                line: 'The unblocking step is a phone call or appointment. Suggested who/when.' },
  { route: 'research',  example: 'What\'s the best baby monitor under $100',  line: 'Underspecified. AI hands back a polished prompt you can paste into Claude or ChatGPT.' },
  { route: 'drop',      example: 'Alphabetize the spice rack',                 line: 'Not worth doing — one-line rationale so you can let it go guilt-free.' },
];

export default function HelpModal({ onClose }: Props) {
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function restoreTip() {
    localStorage.removeItem(TIP_KEY);
    setRestored(true);
    window.setTimeout(() => setRestored(false), 1800);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-stoop-ink/30 px-4 py-10 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-label="How AI scoping works"
    >
      <div
        className="w-full max-w-[640px] overflow-hidden rounded-card border border-stoop-hairline bg-stoop-panel shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-stoop-hairline px-5 py-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
            How AI scoping works
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="rounded p-1.5 text-stoop-muted hover:bg-stoop-hairline"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon.X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[70vh] overflow-auto px-6 py-5">
          <h2 className="display m-0 text-[22px] leading-[1.15]">
            From <span className="display-italic">problem</span> to <span className="display-italic">solution</span>, in one step.
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-stoop-ink-soft">
            When you add a task, the AI reads the title and proposes the next
            concrete move. It picks one of seven routes and surfaces an
            artifact you can act on — a deep link, a copy-paste prompt, a
            suggested assignee, or just a quiet "do it yourself" chip.
          </p>

          <div className="mt-5 space-y-2.5">
            {ROUTE_TUTORIAL.map(({ route, example, line }) => (
              <div
                key={route}
                className="rounded-card border border-stoop-hairline bg-stoop-panel-warm/40 px-3.5 py-2.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <RouteChip route={route} />
                  <span className="font-mono text-[12.5px] text-stoop-muted">
                    "{example}"
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-stoop-ink-soft">
                  {line}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-card border border-stoop-hairline-2 bg-stoop-canvas px-4 py-3 text-[13px] leading-relaxed text-stoop-ink-soft">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-stoop-muted">
              Tips
            </div>
            <ul className="m-0 list-disc space-y-1.5 pl-5">
              <li>Hover any route chip to see its one-line meaning.</li>
              <li>
                Hit <span className="display-italic">Think harder ✦</span> in the
                mobilization panel to re-scope with a smarter model.
              </li>
              <li>
                Click <span className="display-italic">Just save</span> if the
                AI's suggestion isn't quite right — the task lands plain, ready
                to scope later from its detail drawer.
              </li>
              <li>
                On an existing task, the drawer has a <span className="display-italic">✦ Scope this task</span> button
                — useful for the older backlog.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-stoop-hairline px-4 py-3">
          <button
            type="button"
            className="btn-ghost text-[12.5px]"
            onClick={restoreTip}
          >
            {restored ? 'Tip restored ✓' : 'Show the new-task tip again'}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            className="btn-primary text-[12.5px]"
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
