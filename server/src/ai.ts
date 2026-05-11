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

const AlternateSchema = z.object({
  label: z.string().min(1).max(80),
  url: z.string().url().optional().nullable(),
});

const ScopeJsonSchema = z.object({
  route: RouteEnum,
  next_action: z.string().min(1).max(280).nullable(),
  service_url: z.string().url().nullable(),
  research_prompt: z.string().min(1).max(2000).nullable(),
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
