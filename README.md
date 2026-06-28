# 🧬 gh-profile-gen

Evidence-driven GitHub Profile README Generator. Enter a username — it clones all public repos, scans every file, and builds an accurate profile README from what's actually there.

No forms. No checkboxes. No guessing.

## How it works

```
browser → Cloudflare Pages
              ↓
        Cloudflare Worker  (rate-limit + KV cache)
              ↓
        FastAPI backend
              ↓
        GitHub API → git clone (shallow) → file scan → README
```

## Stack

| Layer    | Tech                              |
|----------|-----------------------------------|
| Frontend | React 18 + Vite                   |
| Backend  | FastAPI + Python 3.11             |
| Worker   | Cloudflare Workers                |
| Cache    | Cloudflare KV                     |
| Analysis | git clone + stdlib (no AI)        |

## Run locally

```bash
bash start.sh
```

Set `GITHUB_TOKEN` in env for higher API rate limits.

---

Inspired by [cicd-auditor](https://github.com/eliekh05/cicd-auditor).
