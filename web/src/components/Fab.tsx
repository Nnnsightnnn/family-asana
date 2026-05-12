type Props = {
  onClick: () => void;
  label?: string;
};

/**
 * Floating action button (bottom-right of the dashboard). The ✦ glyph
 * telegraphs that this is the AI-forward entry point — distinct from the
 * plain "+ Add task" buttons inside each surface.
 */
export default function Fab({ onClick, label = 'Plan a task with AI' }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-stoop-accent text-white shadow-[0_10px_28px_-8px_rgba(168,106,75,0.6)] transition-transform hover:scale-[1.04] active:scale-95 md:bottom-8 md:right-8"
    >
      <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>
        ✦
      </span>
    </button>
  );
}
