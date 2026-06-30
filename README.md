# 🧬 gh-profile-gen

Evidence-driven GitHub Profile README Generator. Enter a username — it scans all public repos via the GitHub Contents API, detects languages and frameworks from real manifest files, and builds an accurate profile README.

No forms. No checkboxes. No Python. No Railway.

## How it works

```
browser → Cloudflare Pages (frontend)
              ↓
        Cloudflare Worker (backend + rate-limit + KV cache)
              ↓
        GitHub API → Contents API per repo → framework detection → README
```

## Stack

| Layer    | Tech                                    |
|----------|-----------------------------------------|
| Frontend | React 18 + Vite                         |
| Backend  | Cloudflare Worker (JS, no Python)       |
| Cache    | Cloudflare KV (1h TTL)                  |
| Analysis | GitHub Contents API (no git clone)      |

## Run locally

```bash
bash start.sh
# Worker   → http://localhost:8787
# Frontend → http://localhost:5173
```

Set `GITHUB_TOKEN` as a wrangler secret for 5000 req/hr instead of 60.

---

Inspired by [cicd-auditor](https://github.com/eliekh05/cicd-auditor).
