import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Avatar, AVATAR_COLORS, Icon, SwatchRow } from '../components/atoms';
import type { User } from '../types';

const PROJECT_COLORS = AVATAR_COLORS;

type SetupValues = {
  name: string;
  avatar_color: string;
  project_name: string;
  project_color: string;
};

const STEP_KEY = 'fa.setup.step';
const VALUES_KEY = 'fa.setup.values';

function loadStep(): number {
  const raw = localStorage.getItem(STEP_KEY);
  const n = raw ? Number(raw) : 1;
  if (n === 1) return 1;
  // Step 3 used to be the invite-the-family screen; collapse anyone still mid-flow
  // onto step 2, which is now the final step.
  if (n === 2 || n === 3) return 2;
  return 1;
}

function loadValues(fallback: SetupValues): SetupValues {
  try {
    const raw = localStorage.getItem(VALUES_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SetupValues>;
    return {
      name: parsed.name ?? fallback.name,
      avatar_color: parsed.avatar_color ?? fallback.avatar_color,
      project_name: parsed.project_name ?? fallback.project_name,
      project_color: parsed.project_color ?? fallback.project_color,
    };
  } catch {
    return fallback;
  }
}

function clearStorage() {
  localStorage.removeItem(STEP_KEY);
  localStorage.removeItem(VALUES_KEY);
}

export default function Setup({ user }: { user: User }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fallback: SetupValues = useMemo(
    () => ({
      name: user.name ?? '',
      avatar_color: user.avatar_color ?? AVATAR_COLORS[0],
      project_name: '',
      project_color: PROJECT_COLORS[0],
    }),
    [user.name, user.avatar_color]
  );

  const [step, setStep] = useState<number>(() => loadStep());
  const [values, setValues] = useState<SetupValues>(() => loadValues(fallback));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist progress on every change so a refresh keeps state.
  useEffect(() => {
    localStorage.setItem(STEP_KEY, String(step));
  }, [step]);
  useEffect(() => {
    localStorage.setItem(VALUES_KEY, JSON.stringify(values));
  }, [values]);

  const setValue = <K extends keyof SetupValues>(k: K, v: SetupValues[K]) =>
    setValues((prev) => ({ ...prev, [k]: v }));

  async function submitStep1(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const updated = await api.updateMe({
        name: values.name.trim(),
        avatar_color: values.avatar_color,
      });
      qc.setQueryData(['me'], { user: updated });
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function submitStep2(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api.createProject({
        name: values.project_name.trim(),
        color: values.project_color,
      });
      // Refresh project list so Dashboard shows it immediately after wizard.
      qc.invalidateQueries({ queryKey: ['projects'] });
      // Mark setup complete in the same atomic UI action — no separate invite step.
      await api.installationComplete();
      qc.invalidateQueries({ queryKey: ['installation'] });
      clearStorage();
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="paper min-h-full">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
        <div className="mb-10 flex items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-stoop-accent text-white">
            <Icon.Home className="h-4 w-4" />
          </span>
          <span className="font-medium tracking-tight">Family</span>
        </div>

        <Stepper step={step} />

        <div className="mt-8 rounded-card border border-stoop-hairline bg-stoop-panel p-6 shadow-soft sm:p-8">
          {step === 1 && (
            <form onSubmit={submitStep1}>
              <h1 className="display text-[28px] leading-[1.1] m-0">
                Confirm <span className="display-italic">yourself.</span>
              </h1>
              <p className="mt-3 text-[14.5px] leading-relaxed text-stoop-muted">
                This is how everyone else in the household will see you. You can
                change it later.
              </p>

              <div className="mt-7 flex items-center gap-4">
                <Avatar
                  user={{
                    name: values.name || user.email,
                    avatar_color: values.avatar_color,
                  }}
                  size={56}
                />
                <div className="flex-1">
                  <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                    Display name
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    className="input-shell mt-2 text-[15px]"
                    placeholder="What should we call you?"
                    value={values.name}
                    onChange={(e) => setValue('name', e.target.value)}
                  />
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                  Avatar color
                </label>
                <SwatchRow
                  value={values.avatar_color}
                  onChange={(c) => setValue('avatar_color', c)}
                  colors={AVATAR_COLORS}
                />
              </div>

              {error && <p className="mt-4 text-sm text-[#B36447]">{error}</p>}

              <div className="mt-7 flex items-center justify-between">
                <span className="text-xs text-stoop-muted">Step 1 of 2</span>
                <button
                  type="submit"
                  className="btn-primary px-5 py-2.5 text-[14.5px]"
                  disabled={saving || !values.name.trim()}
                >
                  {saving ? 'Saving…' : 'Next'}
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={submitStep2}>
              <h1 className="display text-[28px] leading-[1.1] m-0">
                Your first <span className="display-italic">project.</span>
              </h1>
              <p className="mt-3 text-[14.5px] leading-relaxed text-stoop-muted">
                Projects are buckets for related to-dos. Start with something
                small — maybe "Home" or "This week."
              </p>

              <div className="mt-7">
                <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                  Project name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  className="input-shell mt-2 text-[15px]"
                  placeholder="e.g. Home"
                  value={values.project_name}
                  onChange={(e) => setValue('project_name', e.target.value)}
                />
              </div>

              <div className="mt-6">
                <label className="block text-[11px] font-medium uppercase tracking-[0.04em] text-stoop-muted">
                  Project color
                </label>
                <SwatchRow
                  value={values.project_color}
                  onChange={(c) => setValue('project_color', c)}
                  colors={PROJECT_COLORS}
                />
              </div>

              {error && <p className="mt-4 text-sm text-[#B36447]">{error}</p>}

              <div className="mt-7 flex items-center justify-between">
                <button
                  type="button"
                  className="btn-ghost px-3 py-2 text-[14px]"
                  onClick={() => setStep(1)}
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn-primary px-5 py-2.5 text-[14.5px]"
                  disabled={saving || !values.project_name.trim()}
                >
                  {saving ? 'Finishing…' : 'Finish'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-stoop-muted">
          Signed in as {user.email}
        </p>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ['You', 'Project'];
  return (
    <ol className="flex items-center gap-3">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-3">
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold"
              style={{
                background: done
                  ? '#6B8A6E'
                  : active
                    ? '#A86A4B'
                    : 'transparent',
                color: done || active ? '#fff' : '#7A7066',
                border: done || active ? 'none' : '1px solid #E4DBCB',
              }}
            >
              {done ? <Icon.Check className="h-3.5 w-3.5" /> : idx}
            </span>
            <span
              className="text-[13px]"
              style={{ color: active ? '#1F1B17' : '#7A7066' }}
            >
              {label}
            </span>
            {idx < labels.length && (
              <span className="ml-1 h-px flex-1 bg-stoop-hairline" />
            )}
          </li>
        );
      })}
    </ol>
  );
}


