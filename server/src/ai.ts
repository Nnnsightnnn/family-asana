import OpenAI from 'openai';
import { z } from 'zod';
import { env } from './env.js';

const client = env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: env.OPENROUTER_API_KEY,
      baseURL: env.OPENROUTER_BASE_URL,
      defaultHeaders: {
        // OpenRouter convention — improves attribution in their dashboard.
        'HTTP-Referer': env.APP_URL,
        'X-Title': env.OPENROUTER_APP_NAME,
      },
    })
  : null;

export type Route =
  | 'diy'
  | 'delegate'
  | 'outsource'
  | 'buy'
  | 'schedule'
  | 'research'
  | 'drop'
  | 'unset';

const RouteEnum = z.enum([
  'diy',
  'delegate',
  'outsource',
  'buy',
  'schedule',
  'research',
  'drop',
]);

// LLMs frequently omit optional fields or return empty strings instead of null.
// `.nullable()` rejects undefined and `.min(1)` rejects "". Both surface as a
// parse_error and disable the whole plan in the UI. These helpers accept missing,
// null, and whitespace-only inputs and normalize to null.
const nullableText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const s = (v ?? '').trim();
      return s.length > 0 ? s : null;
    });

// URL fields: lenient — non-http(s) strings degrade to null rather than fail.
const nullableUrl = z
  .string()
  .nullish()
  .transform((v) => {
    const s = (v ?? '').trim();
    if (!s) return null;
    return /^https?:\/\/\S+$/.test(s) ? s : null;
  });

const AlternateSchema = z.object({
  label: z.string().min(1).max(80),
  url: nullableUrl,
});

export const ScopeJsonSchema = z.object({
  route: RouteEnum,
  next_action: nullableText(280),
  service_url: nullableUrl,
  research_prompt: nullableText(2000),
  alternates: z.array(AlternateSchema).max(3).default([]),
  confidence: z.enum(['low', 'medium', 'high']),
});

export type DisabledReason = 'no_key' | 'api_error' | 'empty_response' | 'parse_error';

export type ScopeResult = {
  route: Route;
  next_action: string | null;
  service_url: string | null;
  research_prompt: string | null;
  alternates: Array<{ label: string; url?: string | null }>;
  confidence: 'low' | 'medium' | 'high';
  model: string;
  disabled?: true;
  disabled_reason?: DisabledReason;
};

const SYSTEM_PROMPT = `You scope household tasks for a small family task manager. Given a task title (and optional description and due date), classify it into ONE of seven routes and produce the next concrete artifact.

Routes:
- diy: trivial task the family does itself (vacuum, laundry, take out trash, water plants). next_action is null unless there's a genuinely useful nudge.
- delegate: belongs on a different household member's plate. next_action: short ask, e.g. "Ask Em to handle the school forms".
- outsource: a paid service is the right path (deep clean, handyman, plumbing, moving, lawn). next_action: verb-led step. service_url: a well-known marketplace search/landing page.
- buy: the task is actually a purchase. next_action: short. service_url: Amazon or Instacart search URL.
- schedule: the unblocking step is a phone call or appointment (book a doctor, call HVAC, schedule inspection). next_action: who to call + when.
- research: too underspecified to act on. next_action: brief. research_prompt: a polished one-paragraph copy-paste prompt the user can drop into Claude/ChatGPT to get a recommendation.
- drop: not worth doing. next_action: one sentence on why.

URL rules — IMPORTANT:
- Only use well-known marketplace landing/search URLs. Acceptable patterns:
  - https://www.taskrabbit.com/services/<category-slug>  (e.g. /cleaning-services, /handyman, /moving-services)
  - https://www.amazon.com/s?k=<url-encoded-query>
  - https://www.instacart.com/store/s?k=<url-encoded-query>
  - https://www.handy.com/services/<category-slug>
  - https://www.thumbtack.com/k/<category-slug>/near-me/
- Never invent specific listing or product URLs. If unsure of a real URL, set service_url to null.

Output STRICT JSON matching this schema (NO prose, NO markdown fences):
{
  "route": "diy"|"delegate"|"outsource"|"buy"|"schedule"|"research"|"drop",
  "next_action": string | null,
  "service_url": string | null,
  "research_prompt": string | null,
  "alternates": [{"label": string, "url": string | null}],   // 0-3 items
  "confidence": "low"|"medium"|"high"
}

Behavior:
- next_action is at most one short imperative sentence.
- research_prompt is populated ONLY when route=research; otherwise null.
- alternates can be empty.
- For diy with no nudge worth giving, next_action is null and alternates is [].`;

function buildUserMessage(input: {
  title: string;
  description?: string;
  due_date?: number | null;
}): string {
  const lines = [`Title: ${input.title}`];
  if (input.description && input.description.trim()) {
    lines.push(`Description: ${input.description.trim()}`);
  }
  if (input.due_date) {
    const d = new Date(input.due_date);
    lines.push(`Due: ${d.toISOString().slice(0, 10)}`);
  }
  return lines.join('\n');
}

function disabledResult(reason: DisabledReason): ScopeResult {
  return {
    route: 'unset',
    next_action: null,
    service_url: null,
    research_prompt: null,
    alternates: [],
    confidence: 'low',
    model: '',
    disabled: true,
    disabled_reason: reason,
  };
}

export function isScopingEnabled(): boolean {
  return client !== null;
}

// Models occasionally wrap JSON output in ```json ... ``` fences despite the system
// prompt + response_format: json_object asking for raw JSON. Strip them before parsing.
export function stripJsonFences(raw: string): string {
  const fenced = raw.trim().match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/);
  return fenced ? fenced[1].trim() : raw;
}

export async function scopeTask(
  input: { title: string; description?: string; due_date?: number | null },
  opts?: { tier?: 'fast' | 'smart' }
): Promise<ScopeResult> {
  if (!client) {
    // eslint-disable-next-line no-console
    console.log(`[ai] scoping disabled (no OPENROUTER_API_KEY); title="${input.title}"`);
    return disabledResult('no_key');
  }

  const tier = opts?.tier ?? 'fast';
  const model = tier === 'smart' ? env.OPENROUTER_SMART_MODEL : env.OPENROUTER_FAST_MODEL;

  let raw: string | null = null;
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 600,
    });
    raw = completion.choices[0]?.message?.content ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[ai] OpenRouter call failed (${model}): ${msg}`);
    return { ...disabledResult('api_error'), model };
  }

  if (!raw) return { ...disabledResult('empty_response'), model };

  try {
    const parsed = ScopeJsonSchema.parse(JSON.parse(stripJsonFences(raw)));
    return {
      route: parsed.route,
      next_action: parsed.next_action,
      service_url: parsed.service_url,
      research_prompt: parsed.research_prompt,
      alternates: parsed.alternates.map((a) => ({ label: a.label, url: a.url ?? null })),
      confidence: parsed.confidence,
      model,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[ai] failed to parse scope JSON: ${msg}; raw="${raw.slice(0, 300)}"`);
    return { ...disabledResult('parse_error'), model };
  }
}

// ── Plan-from-text ─────────────────────────────────────────────────
// Free-form input classifier: takes a paragraph and decides whether the user
// described a single task, a list of independent tasks, or a whole project
// with sub-tasks. Each surfaced task is also routed (route + next_action).

const PlanTaskSchema = z.object({
  title: z.string().min(1).max(140),
  route: RouteEnum,
  next_action: nullableText(280),
  service_url: nullableUrl,
});

// Restrict project colors to the stoop-palette swatch set used by the UI.
const PROJECT_PALETTE = [
  '#A86A4B', '#874F33', '#6B8A6E', '#5A7A8E',
  '#7A5C2E', '#6F4A8E', '#B36447', '#5A5A8E',
];
const ProjectColorSchema = z.enum([
  '#A86A4B', '#874F33', '#6B8A6E', '#5A7A8E',
  '#7A5C2E', '#6F4A8E', '#B36447', '#5A5A8E',
]);

export const PlanJsonSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('task'),
    task: PlanTaskSchema.extend({
      confidence: z.enum(['low', 'medium', 'high']),
      research_prompt: nullableText(2000),
    }),
  }),
  z.object({
    kind: z.literal('task_list'),
    tasks: z.array(PlanTaskSchema).min(1).max(12),
  }),
  z.object({
    kind: z.literal('project'),
    project: z.object({
      name: z.string().min(1).max(60),
      color: ProjectColorSchema,
    }),
    tasks: z.array(PlanTaskSchema).min(1).max(12),
  }),
]);

export type PlanTask = z.infer<typeof PlanTaskSchema>;
export type PlanResult =
  | { disabled: true; disabled_reason: DisabledReason; model: string }
  | {
      disabled?: false;
      model: string;
      kind: 'task';
      task: PlanTask & {
        confidence: 'low' | 'medium' | 'high';
        research_prompt?: string | null;
      };
    }
  | { disabled?: false; model: string; kind: 'task_list'; tasks: PlanTask[] }
  | {
      disabled?: false;
      model: string;
      kind: 'project';
      project: { name: string; color: string };
      tasks: PlanTask[];
    };

const PLAN_SYSTEM_PROMPT = `You help a small family decide how to start something new — a single task, a short list of tasks, or a whole project. Given free-form text, classify and structure it.

Classification (be conservative — when in doubt, prefer "task"):
- "task": one discrete thing to do. Use this for short text or anything that's not obviously a list.
- "task_list": 2-4 discrete chores in the same context, no umbrella initiative. E.g. "vacuum living room, take out trash, water plants".
- "project": multiple things under an umbrella initiative (renovation, party, vacation, big purchase), OR text that explicitly says "project" / "plan a ...". E.g. "kitchen renovation — new cabinets, find tile installer, paint".

For each surfaced task, classify into ONE of seven routes and produce a next_action:
- diy / delegate / outsource / buy / schedule / research / drop

URL rules — IMPORTANT (same as single-task scoping):
- Only well-known marketplace landing/search URLs. Acceptable: taskrabbit.com/services/<slug>, amazon.com/s?k=<query>, instacart.com/store/s?k=<query>, handy.com/services/<slug>, thumbtack.com/k/<slug>/near-me/.
- Never invent specific listings. If unsure, set service_url to null.

Project naming:
- Title Case, 2-4 words ("Kitchen Renovation", "Sam's Birthday Party").
- Pick color from EXACTLY this palette: #A86A4B, #874F33, #6B8A6E, #5A7A8E, #7A5C2E, #6F4A8E, #B36447, #5A5A8E.

Output STRICT JSON (NO prose, NO markdown fences) — one of THREE shapes:

Single task:
{
  "kind": "task",
  "task": { "title": "...", "route": "...", "next_action": "...|null", "service_url": "...|null", "confidence": "low|medium|high", "research_prompt": "...|null" }
}

Task list (multiple tasks, no umbrella):
{
  "kind": "task_list",
  "tasks": [ { "title": "...", "route": "...", "next_action": "...|null", "service_url": "...|null" } ]
}

Project (umbrella initiative + sub-tasks):
{
  "kind": "project",
  "project": { "name": "Short Title Case", "color": "#hex from palette" },
  "tasks": [ { "title": "...", "route": "...", "next_action": "...|null", "service_url": "...|null" } ]
}

Constraints:
- Max 12 tasks per plan. Tighter is better; don't pad.
- Each task title is 1-12 words.
- research_prompt is populated ONLY when route=research (and only on the single-task shape).`;

function disabledPlanResult(reason: DisabledReason, model = ''): PlanResult {
  return { disabled: true, disabled_reason: reason, model };
}

export async function planFromText(
  input: { text: string; project_id?: string | null },
  opts?: { tier?: 'fast' | 'smart' }
): Promise<PlanResult> {
  if (!client) {
    // eslint-disable-next-line no-console
    console.log(`[ai] plan disabled (no OPENROUTER_API_KEY); text="${input.text.slice(0, 80)}"`);
    return disabledPlanResult('no_key');
  }

  const tier = opts?.tier ?? 'fast';
  const model = tier === 'smart' ? env.OPENROUTER_SMART_MODEL : env.OPENROUTER_FAST_MODEL;

  let raw: string | null = null;
  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: input.text.slice(0, 2000) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 1200,
    });
    raw = completion.choices[0]?.message?.content ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[ai] OpenRouter plan call failed (${model}): ${msg}`);
    return disabledPlanResult('api_error', model);
  }

  if (!raw) return disabledPlanResult('empty_response', model);

  try {
    const parsed = PlanJsonSchema.parse(JSON.parse(stripJsonFences(raw)));
    if (parsed.kind === 'task') {
      return {
        model,
        kind: 'task',
        task: {
          title: parsed.task.title,
          route: parsed.task.route,
          next_action: parsed.task.next_action,
          service_url: parsed.task.service_url,
          confidence: parsed.task.confidence,
          research_prompt: parsed.task.research_prompt ?? null,
        },
      };
    }
    if (parsed.kind === 'task_list') {
      return { model, kind: 'task_list', tasks: parsed.tasks };
    }
    return {
      model,
      kind: 'project',
      project: parsed.project,
      tasks: parsed.tasks,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[ai] failed to parse plan JSON: ${msg}; raw="${raw.slice(0, 300)}"`);
    return disabledPlanResult('parse_error', model);
  }
}

export { PROJECT_PALETTE };
