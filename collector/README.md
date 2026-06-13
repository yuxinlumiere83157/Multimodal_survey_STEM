# Cloudflare Worker + D1 Survey Collector

This collector gives the static Hugging Face demo a central, free-results destination without uploading raw webcam frames.

## Endpoints

- `GET /api/health` confirms the Worker is reachable.
- `POST /api/submit-survey` stores one survey submission in D1.
- `GET /api/export.json` exports stored rows as JSON. Requires an admin bearer token.
- `GET /api/export.csv` exports stored rows as CSV. Requires an admin bearer token.

## Stored Data

The Worker stores:

- project ID
- session ID
- receive/submission timestamps
- source origin
- raw answers JSON
- derived emotion timeline JSON
- analysis JSON
- scalar summary fields for easy export

It does not store raw camera frames, raw webcam video, IP addresses, or user-agent strings.

## First-Time Cloudflare Setup

Install dependencies:

```bash
cd collector
npm install
```

Log in to Cloudflare:

```bash
npx wrangler login
```

Create the D1 database:

```bash
npx wrangler d1 create multimodal-survey-results
```

Copy the returned `database_id` into `wrangler.toml` under `[[d1_databases]]`.

Initialize the remote schema:

```bash
npm run d1:init:remote
```

Set an admin export token:

```bash
npx wrangler secret put COLLECTOR_ADMIN_TOKEN
```

Deploy:

```bash
npm run deploy
```

Wrangler will print a Worker URL like:

```text
https://multimodal-survey-collector.<your-subdomain>.workers.dev
```

## Connect the Hugging Face Static Demo

Update `client/public/collector-config.json`:

```json
{
  "enabled": true,
  "projectId": "multimodal-survey-stem",
  "collectorUrl": "https://multimodal-survey-collector.<your-subdomain>.workers.dev"
}
```

Rebuild and redeploy the static frontend. Submissions will then go to D1 first. If the Worker is unavailable, the frontend still falls back to the local Flask API or browser JSON download.

## Export Results

Use the admin token you created with `wrangler secret put`:

```bash
curl -H "Authorization: Bearer <admin-token>" \
  "https://multimodal-survey-collector.<your-subdomain>.workers.dev/api/export.csv?projectId=multimodal-survey-stem" \
  -o survey-submissions.csv
```

For JSON:

```bash
curl -H "Authorization: Bearer <admin-token>" \
  "https://multimodal-survey-collector.<your-subdomain>.workers.dev/api/export.json?projectId=multimodal-survey-stem" \
  -o survey-submissions.json
```
