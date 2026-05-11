import { useEffect } from 'react';

export type Shortcut = {
  /** Single key like 'n', '/', 'Escape'. Matched case-insensitively against e.key. */
  key: string;
  handler: (e: KeyboardEvent) => void;
  /** When true, the shortcut also fires while focus is in an input/textarea/contenteditable. Defaults to false. */
  whenInput?: boolean;
};

// TODO: add a "?" help overlay listing registered shortcuts.
// TODO: j/k row navigation — needs focus tracking inside ListView; deferred.

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Register window-level keydown shortcuts. Shortcuts that don't set
 * `whenInput: true` are skipped when an editable element has focus.
 * Ignores events with modifier keys (cmd/ctrl/alt) so browser shortcuts
 * keep working.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const editable = isEditableTarget(e.target);
      const key = e.key;
      for (const s of shortcuts) {
        if (s.key.toLowerCase() !== key.toLowerCase()) continue;
        if (editable && !s.whenInput) continue;
        s.handler(e);
        break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts]);
}
