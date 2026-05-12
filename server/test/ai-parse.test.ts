import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PlanJsonSchema, ScopeJsonSchema, stripJsonFences } from '../src/ai.js';

test('stripJsonFences', async (t) => {
  await t.test('passes through raw JSON unchanged', () => {
    const raw = '{"route":"diy","confidence":"high"}';
    assert.equal(stripJsonFences(raw), raw);
  });

  await t.test('strips ```json fences (the case observed in prod logs)', () => {
    const raw = '```json\n{\n  "route": "diy",\n  "confidence": "high"\n}\n```';
    const out = stripJsonFences(raw);
    assert.equal(JSON.parse(out).route, 'diy');
  });

  await t.test('strips bare ``` fences', () => {
    const raw = '```\n{"route":"buy"}\n```';
    assert.equal(JSON.parse(stripJsonFences(raw)).route, 'buy');
  });

  await t.test('tolerates leading/trailing whitespace around fences', () => {
    const raw = '\n  ```json\n{"route":"schedule"}\n```  \n';
    assert.equal(JSON.parse(stripJsonFences(raw)).route, 'schedule');
  });

  await t.test('leaves a string with a stray backtick alone if not a full fence', () => {
    const raw = '{"next_action":"Use `make build`"}';
    assert.equal(stripJsonFences(raw), raw);
  });
});

test('PlanJsonSchema tolerates the LLM-output failure modes observed in prod', async (t) => {
  await t.test('task_list with missing service_url field on tasks → null', () => {
    // Mirrors the actual prod failure: model omitted service_url entirely.
    const raw = JSON.stringify({
      kind: 'task_list',
      tasks: [
        { title: 'Vacuum living room', route: 'diy', next_action: null },
        { title: 'Take out trash', route: 'diy', next_action: '' },
      ],
    });
    const parsed = PlanJsonSchema.parse(JSON.parse(raw));
    assert.equal(parsed.kind, 'task_list');
    if (parsed.kind !== 'task_list') return;
    assert.equal(parsed.tasks[0].service_url, null);
    assert.equal(parsed.tasks[1].service_url, null);
    assert.equal(parsed.tasks[1].next_action, null, 'empty string → null');
  });

  await t.test('project with whitespace-only next_action and unscheme URL', () => {
    const raw = JSON.stringify({
      kind: 'project',
      project: { name: 'Kitchen Renovation', color: '#A86A4B' },
      tasks: [
        {
          title: 'Find tile installer',
          route: 'outsource',
          next_action: '   ',
          service_url: 'taskrabbit.com/services/handyman', // missing https://
        },
      ],
    });
    const parsed = PlanJsonSchema.parse(JSON.parse(raw));
    assert.equal(parsed.kind, 'project');
    if (parsed.kind !== 'project') return;
    assert.equal(parsed.tasks[0].next_action, null);
    assert.equal(parsed.tasks[0].service_url, null, 'invalid URL → null, not parse error');
  });

  await t.test('single task with research_prompt omitted', () => {
    const raw = JSON.stringify({
      kind: 'task',
      task: {
        title: 'Order air filters',
        route: 'buy',
        next_action: 'Order from Amazon',
        service_url: 'https://www.amazon.com/s?k=hvac+filter',
        confidence: 'high',
        // research_prompt omitted entirely
      },
    });
    const parsed = PlanJsonSchema.parse(JSON.parse(raw));
    assert.equal(parsed.kind, 'task');
    if (parsed.kind !== 'task') return;
    assert.equal(parsed.task.research_prompt, null);
    assert.equal(parsed.task.service_url, 'https://www.amazon.com/s?k=hvac+filter');
  });
});

test('ScopeJsonSchema tolerates omitted nullable fields', async (t) => {
  await t.test('diy route with omitted next_action / service_url / research_prompt', () => {
    const raw = JSON.stringify({
      route: 'diy',
      confidence: 'high',
      // next_action, service_url, research_prompt all omitted
    });
    const parsed = ScopeJsonSchema.parse(JSON.parse(raw));
    assert.equal(parsed.route, 'diy');
    assert.equal(parsed.next_action, null);
    assert.equal(parsed.service_url, null);
    assert.equal(parsed.research_prompt, null);
    assert.deepEqual(parsed.alternates, []);
  });

  await t.test('outsource with valid URL stays as-is', () => {
    const raw = JSON.stringify({
      route: 'outsource',
      confidence: 'medium',
      next_action: 'Book a TaskRabbit cleaner',
      service_url: 'https://www.taskrabbit.com/services/cleaning-services',
      research_prompt: null,
    });
    const parsed = ScopeJsonSchema.parse(JSON.parse(raw));
    assert.equal(parsed.service_url, 'https://www.taskrabbit.com/services/cleaning-services');
    assert.equal(parsed.next_action, 'Book a TaskRabbit cleaner');
  });
});
