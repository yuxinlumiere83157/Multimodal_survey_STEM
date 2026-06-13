import assert from 'node:assert/strict';
import test from 'node:test';

import worker, { buildSummary, rowsToCsv } from '../src/index.js';

function createFakeDb(rows = []) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        sql,
        params: [],
        bind(...params) {
          this.params = params;
          return this;
        },
        async run() {
          calls.push({ type: 'run', sql, params: this.params });
          return { success: true };
        },
        async all() {
          calls.push({ type: 'all', sql, params: this.params });
          return { results: rows };
        },
      };
      return statement;
    },
  };
}

test('health returns CORS-aware JSON', async () => {
  const request = new Request('https://collector.example/api/health', {
    headers: { Origin: 'https://impale5666-multimodal-survey-demo.static.hf.space' },
  });
  const response = await worker.fetch(request, { DB: createFakeDb() });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(
    response.headers.get('Access-Control-Allow-Origin'),
    'https://impale5666-multimodal-survey-demo.static.hf.space'
  );
});

test('submit-survey stores validated payload in D1', async () => {
  const db = createFakeDb();
  const response = await worker.fetch(
    new Request('https://collector.example/api/submit-survey', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://impale5666-multimodal-survey-demo.static.hf.space',
      },
      body: JSON.stringify({
        projectId: 'multimodal-survey-stem',
        sessionId: 'session-1',
        answers: { 1: '2 - Sometimes' },
        emotionSession: { 1: { sampleCount: 3 } },
        analysis: {
          selfReport: { stressAverage_0_to_4: 2.5, stressLevel: 'Moderate' },
          facialEmotion: { facialPattern: 'Neutral', totalSamples: 3 },
          comparison: { discrepancyDetected: false },
        },
        scoredStudy: {
          summaryScores: {
            susScore_0_to_100: 72.5,
            trustPrivacyAverage_1_to_5: 4.2,
          },
        },
      }),
    }),
    { DB: db }
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.storageMode, 'cloudflare-d1');
  assert.equal(body.sessionId, 'session-1');
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].params[0], 'multimodal-survey-stem');
  assert.equal(db.calls[0].params[1], 'session-1');
  assert.equal(db.calls[0].params[6], 2.5);
  assert.equal(db.calls[0].params[8], 72.5);
  assert.equal(db.calls[0].params[9], 4.2);
});

test('export JSON requires admin bearer token', async () => {
  const response = await worker.fetch(
    new Request('https://collector.example/api/export.json'),
    { DB: createFakeDb(), COLLECTOR_ADMIN_TOKEN: 'secret' }
  );

  assert.equal(response.status, 401);
});

test('export CSV returns rows with admin bearer token', async () => {
  const db = createFakeDb([
    {
      id: 1,
      project_id: 'project',
      session_id: 'session',
      received_at: '2026-06-14T00:00:00.000Z',
      submitted_at: '2026-06-14T00:00:00.000Z',
      source_origin: 'https://example.com',
      stress_average: 2,
      stress_level: 'Moderate',
      sus_score: 70,
      trust_privacy_average: 4,
      facial_pattern: 'Neutral',
      total_samples: 6,
      discrepancy_detected: 0,
      payload_json: '{"answers":{"1":"2 - Sometimes"}}',
    },
  ]);

  const response = await worker.fetch(
    new Request('https://collector.example/api/export.csv', {
      headers: { Authorization: 'Bearer secret' },
    }),
    { DB: db, COLLECTOR_ADMIN_TOKEN: 'secret' }
  );
  const csv = await response.text();

  assert.equal(response.status, 200);
  assert.match(csv, /^id,project_id,session_id/);
  assert.match(csv, /project,session/);
});

test('summary extraction is stable for missing fields', () => {
  assert.deepEqual(buildSummary({}), {
    stressAverage: null,
    stressLevel: null,
    susScore: null,
    trustPrivacyAverage: null,
    facialPattern: null,
    totalSamples: null,
    discrepancyDetected: null,
  });
});

test('CSV escaping handles commas and quotes', () => {
  const csv = rowsToCsv([{ id: 1, project_id: 'a,b', payload_json: '{"x":"y"}' }]);
  assert.match(csv, /"a,b"/);
  assert.match(csv, /"{""x"":""y""}"/);
});
