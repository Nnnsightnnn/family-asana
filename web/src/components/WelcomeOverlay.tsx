import { useEffect, useRef, useState } from 'react';
import { Icon } from './atoms';

type VideoEntry = {
  title?: string;
  poster?: string;
  sources: { src: string; type: string }[];
};

type Manifest = {
  active: string;
  videos: Record<string, VideoEntry>;
};

const STORAGE_KEY = 'welcome-played';

function markPlayed() {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // sessionStorage throws in some private-mode browsers; replaying once
    // more next mount is the acceptable worst case.
  }
}

function alreadyPlayed(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function WelcomeOverlay() {
  // Decide once on first render. If we've already played this session, this
  // component renders nothing forever and never fetches the manifest.
  const [skip] = useState(alreadyPlayed);
  const [video, setVideo] = useState<VideoEntry | null>(null);
  const [closing, setClosing] = useState(false);
  const [visible, setVisible] = useState(false);
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (skip) return;
    let cancelled = false;
    fetch('/welcome/manifest.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('manifest 404'))))
      .then((m: Manifest) => {
        if (cancelled) return;
        const entry = m.active && m.videos ? m.videos[m.active] : undefined;
        if (!entry || !entry.sources?.length) {
          // Kill switch: no active video. Mark played so we don't refetch
          // this session, and stay unmounted.
          markPlayed();
          return;
        }
        setVideo(entry);
        requestAnimationFrame(() => setVisible(true));
      })
      .catch(() => {
        markPlayed();
      });
    return () => {
      cancelled = true;
    };
  }, [skip]);

  function dismiss() {
    if (closing) return;
    setClosing(true);
    markPlayed();
    setTimeout(() => setVideo(null), 400);
  }

  useEffect(() => {
    if (!video) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismiss();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // dismiss is stable enough — referencing video state is enough to keep
    // this in sync with the overlay lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video]);

  if (skip || !video) return null;

  return (
    <div
      role="dialog"
      aria-label="Welcome"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stoop-canvas/40 backdrop-blur-sm"
      style={{
        opacity: visible && !closing ? 1 : 0,
        transitionProperty: 'opacity',
        transitionDuration: closing ? '400ms' : '200ms',
        transitionTimingFunction: 'ease-out',
      }}
    >
      {reducedMotion.current ? (
        video.poster ? (
          <img
            src={video.poster}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null
      ) : (
        <video
          autoPlay
          muted
          playsInline
          preload="auto"
          poster={video.poster}
          onEnded={dismiss}
          className="h-full w-full object-cover"
        >
          {video.sources.map((s) => (
            <source key={s.src} src={s.src} type={s.type} />
          ))}
        </video>
      )}

      <button
        type="button"
        aria-label="Dismiss welcome"
        onClick={dismiss}
        className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full bg-stoop-canvas/80 text-stoop-ink shadow-sm backdrop-blur-sm transition-colors hover:bg-stoop-canvas focus:outline-none focus:ring-2 focus:ring-stoop-accent"
      >
        <Icon.X className="h-5 w-5" />
      </button>
    </div>
  );
}
