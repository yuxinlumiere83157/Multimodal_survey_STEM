CREATE TABLE IF NOT EXISTS survey_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  submitted_at TEXT,
  source_origin TEXT,
  app_version TEXT,
  stress_average REAL,
  stress_level TEXT,
  sus_score REAL,
  trust_privacy_average REAL,
  facial_pattern TEXT,
  total_samples INTEGER,
  discrepancy_detected INTEGER,
  answers_json TEXT NOT NULL,
  emotion_json TEXT,
  analysis_json TEXT,
  payload_json TEXT NOT NULL,
  UNIQUE(project_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_submissions_project_received
  ON survey_submissions(project_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_survey_submissions_session
  ON survey_submissions(session_id);
