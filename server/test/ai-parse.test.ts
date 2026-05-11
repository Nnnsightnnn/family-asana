import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripJsonFences } from '../src/ai.js';

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
