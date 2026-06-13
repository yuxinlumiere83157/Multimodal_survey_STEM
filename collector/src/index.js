const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://impale5666-multimodal-survey-demo.static.hf.space',
];

const MAX_BODY_BYTES = 1_000_000;
const DEFAULT_PROJECT_ID = 'multimodal-survey-stem';

function parseAllowedOrigins(env = {}) {
  const raw = env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(',');
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  const allowedOrigins = parseAllowedOrigins(env);
  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = parseAllowedOrigins(env);
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function jsonResponse(data, request, env, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

function textResponse(body, request, env, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...corsHeaders(request, env),
      ...(init.headers || {}),
    },
  });
}

async function readJson(request) {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error('Payload is too large.');
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error('Payload is too large.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

function safeJson(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function requireD1(env) {
  if (!env.DB) {
    throw new Error('D1 binding DB is not configured.');
  }
  return env.DB;
}

function validateSubmission(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Submission payload must be an object.';
  }

  if (!payload.answers || typeof payload.answers !== 'object' || Array.isArray(payload.answers)) {
    return 'answers must be an object.';
  }

  return null;
}

function buildSummary(analysis = {}, scoredStudy = {}) {
  const summaryScores = scoredStudy.summaryScores || {};

  return {
    stressAverage: analysis.selfReport?.stressAverage_0_to_4 ?? summaryScores.stressAverage_0_to_4 ?? null,
    stressLevel: analysis.selfReport?.stressLevel ?? null,
    susScore:
      analysis.usability?.susScore_0_to_100 ??
      analysis.selfReport?.susScore_0_to_100 ??
      summaryScores.susScore_0_to_100 ??
      null,
    trustPrivacyAverage:
      analysis.trustPrivacy?.trustPrivacyAverage_1_to_5 ??
      summaryScores.trustPrivacyAverage_1_to_5 ??
      null,
    facialPattern: analysis.facialEmotion?.facialPattern ?? null,
    totalSamples: analysis.facialEmotion?.totalSamples ?? null,
    discrepancyDetected:
      typeof analysis.comparison?.discrepancyDetected === 'boolean'
        ? Number(analysis.comparison.discrepancyDetected)
        : null,
  };
}

async function saveSubmission(request, env) {
  if (!isOriginAllowed(request, env)) {
    return jsonResponse({ success: false, error: 'Origin is not allowed.' }, request, env, { status: 403 });
  }

  const payload = await readJson(request);
  const validationError = validateSubmission(payload);
  if (validationError) {
    return jsonResponse({ success: false, error: validationError }, request, env, { status: 400 });
  }

  const db = requireD1(env);
  const now = new Date().toISOString();
  const projectId = String(payload.projectId || DEFAULT_PROJECT_ID).slice(0, 120);
  const sessionId = String(payload.sessionId || `submit_session_${Date.now()}`).slice(0, 160);
  const origin = request.headers.get('Origin') || null;
  const analysis = payload.analysis || {};
  const summary = buildSummary(analysis, payload.scoredStudy);

  await db
    .prepare(
      `INSERT INTO survey_submissions (
        project_id,
        session_id,
        received_at,
        submitted_at,
        source_origin,
        app_version,
        stress_average,
        stress_level,
        sus_score,
        trust_privacy_average,
        facial_pattern,
        total_samples,
        discrepancy_detected,
        answers_json,
        emotion_json,
        analysis_json,
        payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, session_id) DO UPDATE SET
        received_at = excluded.received_at,
        submitted_at = excluded.submitted_at,
        source_origin = excluded.source_origin,
        app_version = excluded.app_version,
        stress_average = excluded.stress_average,
        stress_level = excluded.stress_level,
        sus_score = excluded.sus_score,
        trust_privacy_average = excluded.trust_privacy_average,
        facial_pattern = excluded.facial_pattern,
        total_samples = excluded.total_samples,
        discrepancy_detected = excluded.discrepancy_detected,
        answers_json = excluded.answers_json,
        emotion_json = excluded.emotion_json,
        analysis_json = excluded.analysis_json,
        payload_json = excluded.payload_json`
    )
    .bind(
      projectId,
      sessionId,
      now,
      payload.savedAt || payload.submittedAt || null,
      origin,
      payload.appVersion || null,
      summary.stressAverage,
      summary.stressLevel,
      summary.susScore,
      summary.trustPrivacyAverage,
      summary.facialPattern,
      summary.totalSamples,
      summary.discrepancyDetected,
      safeJson(payload.answers, {}),
      safeJson(payload.emotionSession, {}),
      safeJson(analysis, {}),
      JSON.stringify({
        ...payload,
        projectId,
        sessionId,
        receivedAt: now,
        storageMode: 'cloudflare-d1',
      })
    )
    .run();

  return jsonResponse(
    {
      success: true,
      storageMode: 'cloudflare-d1',
      projectId,
      sessionId,
      receivedAt: now,
    },
    request,
    env
  );
}

function getAdminToken(request) {
  const authorization = request.headers.get('Authorization') || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
}

function isAdminAuthorized(request, env) {
  return Boolean(env.COLLECTOR_ADMIN_TOKEN && getAdminToken(request) === env.COLLECTOR_ADMIN_TOKEN);
}

function parseLimit(url) {
  const requested = Number(url.searchParams.get('limit') || 5000);
  if (!Number.isFinite(requested)) return 5000;
  return Math.min(Math.max(Math.trunc(requested), 1), 10000);
}

async function fetchSubmissionRows(request, env) {
  if (!isAdminAuthorized(request, env)) {
    return {
      response: jsonResponse(
        { success: false, error: 'Admin export requires COLLECTOR_ADMIN_TOKEN and a matching Bearer token.' },
        request,
        env,
        { status: env.COLLECTOR_ADMIN_TOKEN ? 401 : 503 }
      ),
    };
  }

  const db = requireD1(env);
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const limit = parseLimit(url);
  const statement = projectId
    ? db
        .prepare(
          `SELECT * FROM survey_submissions
           WHERE project_id = ?
           ORDER BY received_at DESC
           LIMIT ?`
        )
        .bind(projectId, limit)
    : db
        .prepare(
          `SELECT * FROM survey_submissions
           ORDER BY received_at DESC
           LIMIT ?`
        )
        .bind(limit);

  const result = await statement.all();
  return { rows: result.results || [] };
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rowsToCsv(rows) {
  const columns = [
    'id',
    'project_id',
    'session_id',
    'received_at',
    'submitted_at',
    'source_origin',
    'stress_average',
    'stress_level',
    'sus_score',
    'trust_privacy_average',
    'facial_pattern',
    'total_samples',
    'discrepancy_detected',
    'payload_json',
  ];

  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join('\n');
}

async function exportJson(request, env) {
  const result = await fetchSubmissionRows(request, env);
  if (result.response) return result.response;
  return jsonResponse({ success: true, rows: result.rows }, request, env);
}

async function exportCsv(request, env) {
  const result = await fetchSubmissionRows(request, env);
  if (result.response) return result.response;
  return new Response(rowsToCsv(result.rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="survey-submissions.csv"',
      ...corsHeaders(request, env),
    },
  });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }

  if (!isOriginAllowed(request, env)) {
    return jsonResponse({ success: false, error: 'Origin is not allowed.' }, request, env, { status: 403 });
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return jsonResponse(
      {
        success: true,
        service: 'multimodal-survey-collector',
        storage: 'cloudflare-d1',
      },
      request,
      env
    );
  }

  if (request.method === 'POST' && url.pathname === '/api/submit-survey') {
    return saveSubmission(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/export.json') {
    return exportJson(request, env);
  }

  if (request.method === 'GET' && url.pathname === '/api/export.csv') {
    return exportCsv(request, env);
  }

  return textResponse('Not found', request, env, { status: 404 });
}

export { buildSummary, handleRequest, parseAllowedOrigins, rowsToCsv };

export default {
  fetch(request, env) {
    return handleRequest(request, env);
  },
};
