const DEFAULT_COLLECTOR_CONFIG = {
  enabled: false,
  projectId: 'multimodal-survey-stem',
  collectorUrl: '',
};

let collectorConfigPromise = null;

function normalizeCollectorConfig(config) {
  const merged = {
    ...DEFAULT_COLLECTOR_CONFIG,
    ...(config && typeof config === 'object' ? config : {}),
  };

  return {
    enabled: Boolean(merged.enabled && merged.collectorUrl),
    projectId: String(merged.projectId || DEFAULT_COLLECTOR_CONFIG.projectId),
    collectorUrl: String(merged.collectorUrl || '').replace(/\/+$/, ''),
  };
}

export function resetCollectorConfigCache() {
  collectorConfigPromise = null;
}

export async function loadCollectorConfig() {
  if (!collectorConfigPromise) {
    collectorConfigPromise = fetch('/collector-config.json', {
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) {
          return DEFAULT_COLLECTOR_CONFIG;
        }
        return response.json();
      })
      .then(normalizeCollectorConfig)
      .catch(() => DEFAULT_COLLECTOR_CONFIG);
  }

  return collectorConfigPromise;
}

export async function checkCollectorHealth(config) {
  if (!config?.enabled) {
    return { ok: false, reason: 'disabled' };
  }

  try {
    const response = await fetch(`${config.collectorUrl}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      return { ok: false, reason: `status-${response.status}` };
    }

    const body = await response.json();
    return { ok: true, body };
  } catch (error) {
    return { ok: false, reason: error?.message || 'unreachable' };
  }
}

export async function submitToCollector(config, payload) {
  if (!config?.enabled) {
    throw new Error('Cloudflare collector is not enabled.');
  }

  const response = await fetch(`${config.collectorUrl}/api/submit-survey`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      projectId: config.projectId,
      appVersion: 'browser-onnx-research',
    }),
    signal: AbortSignal.timeout(8000),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody.error || `Collector submit failed with status ${response.status}.`);
  }

  return responseBody;
}
