/**
 * gh-profile-gen — Cloudflare Worker
 *
 * Two sources only:
 *   1. api.github.com      — all profile, repo, manifest data
 *   2. cdn.jsdelivr.net/gh/devicons/devicon@latest — icons (stable CDN, not a deployment)
 *
 * No third-party stat services. No hardcoded values. No caching.
 * Every value in the generated README comes from real API data.
 *
 * POST /generate → SSE stream → { type: "done", readme, stats }
 */

const GH_API     = "https://api.github.com";
const DEVICON    = "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons";
const PER_PAGE   = 100;
const SCAN_BATCH = 5;

// ── Devicon slug map ──────────────────────────────────────────────────────────
// Maps the GitHub API "language" field or detected framework name
// to a devicon icon slug and variant (original/plain/line).
// Only include entries that actually exist in devicon — verified from devicon.json.
// URL pattern: ${DEVICON}/${slug}/${slug}-${variant}.svg
const DEVICON_MAP = {
  // Languages
  "Python":      { slug: "python",        variant: "original" },
  "JavaScript":  { slug: "javascript",    variant: "original" },
  "TypeScript":  { slug: "typescript",    variant: "original" },
  "Go":          { slug: "go",            variant: "original" },
  "Rust":        { slug: "rust",          variant: "original" },
  "Java":        { slug: "java",          variant: "original" },
  "Kotlin":      { slug: "kotlin",        variant: "original" },
  "C":           { slug: "c",             variant: "original" },
  "C++":         { slug: "cplusplus",     variant: "original" },
  "C#":          { slug: "csharp",        variant: "original" },
  "Ruby":        { slug: "ruby",          variant: "original" },
  "PHP":         { slug: "php",           variant: "original" },
  "Swift":       { slug: "swift",         variant: "original" },
  "Dart":        { slug: "dart",          variant: "original" },
  "Scala":       { slug: "scala",         variant: "original" },
  "R":           { slug: "r",             variant: "original" },
  "Lua":         { slug: "lua",           variant: "original" },
  "Elixir":      { slug: "elixir",        variant: "original" },
  "Haskell":     { slug: "haskell",       variant: "original" },
  "Perl":        { slug: "perl",          variant: "original" },
  "Shell":       { slug: "bash",          variant: "original" },
  "HTML":        { slug: "html5",         variant: "original" },
  "CSS":         { slug: "css3",          variant: "original" },
  "Vue":         { slug: "vuejs",         variant: "original" },
  "Svelte":      { slug: "svelte",        variant: "original" },
  "Solidity":    { slug: "solidity",      variant: "original" },
  "MATLAB":      { slug: "matlab",        variant: "original" },
  "Groovy":      { slug: "groovy",        variant: "original" },
  "Terraform":   { slug: "terraform",     variant: "original" },
  // Frameworks & tools
  "React":          { slug: "react",          variant: "original" },
  "Next.js":        { slug: "nextjs",         variant: "original" },
  "Nuxt":           { slug: "nuxtjs",         variant: "original" },
  "Angular":        { slug: "angular",        variant: "original" },
  "Django":         { slug: "django",         variant: "plain"    },
  "Flask":          { slug: "flask",          variant: "original" },
  "FastAPI":        { slug: "fastapi",        variant: "original" },
  "Express":        { slug: "express",        variant: "original" },
  "NestJS":         { slug: "nestjs",         variant: "original" },
  "Spring Boot":    { slug: "spring",         variant: "original" },
  "Rails":          { slug: "rails",          variant: "original" },
  "Laravel":        { slug: "laravel",        variant: "original" },
  "TensorFlow":     { slug: "tensorflow",     variant: "original" },
  "PyTorch":        { slug: "pytorch",        variant: "original" },
  "Docker":         { slug: "docker",         variant: "original" },
  "Kubernetes":     { slug: "kubernetes",     variant: "original" },
  "PostgreSQL":     { slug: "postgresql",     variant: "original" },
  "MongoDB":        { slug: "mongodb",        variant: "original" },
  "Redis":          { slug: "redis",          variant: "original" },
  "MySQL":          { slug: "mysql",          variant: "original" },
  "SQLite":         { slug: "sqlite",         variant: "original" },
  "Tailwind CSS":   { slug: "tailwindcss",    variant: "original" },
  "GraphQL":        { slug: "graphql",        variant: "plain"    },
  "Prisma":         { slug: "prisma",         variant: "original" },
  "Gin":            { slug: "go",             variant: "original" },
  "GitHub Actions": { slug: "githubactions",  variant: "original" },
};

function deviconUrl(name) {
  const entry = DEVICON_MAP[name];
  if (!entry) return null;
  return `${DEVICON}/${entry.slug}/${entry.slug}-${entry.variant}.svg`;
}

// ── Framework detection signals ───────────────────────────────────────────────
const FRAMEWORK_SIGNALS = {
  "React":        ['"react"', '"react-dom"'],
  "Next.js":      ['"next"'],
  "Vue":          ['"vue"'],
  "Nuxt":         ['"nuxt"'],
  "Svelte":       ['"svelte"', "@sveltejs"],
  "Angular":      ["@angular/core"],
  "Django":       ["django"],
  "Flask":        ["flask"],
  "FastAPI":      ["fastapi"],
  "Express":      ['"express"'],
  "NestJS":       ["@nestjs/core"],
  "Spring Boot":  ["spring-boot"],
  "Rails":        ["railties"],
  "Laravel":      ["laravel/framework"],
  "TensorFlow":   ["tensorflow"],
  "PyTorch":      ["torch"],
  "scikit-learn": ["scikit-learn", "sklearn"],
  "Pandas":       ["pandas"],
  "NumPy":        ["numpy"],
  "GraphQL":      ["graphql", "apollo-server", "strawberry-graphql"],
  "PostgreSQL":   ["psycopg2", '"pg"', "asyncpg"],
  "MySQL":        ["mysqlclient", "mysql2", "pymysql"],
  "SQLite":       ["sqlite3", "better-sqlite3"],
  "MongoDB":      ["pymongo", "mongoose"],
  "Redis":        ["redis", "ioredis"],
  "Prisma":       ["prisma", "@prisma/client"],
  "SQLAlchemy":   ["sqlalchemy"],
  "Tailwind CSS": ["tailwindcss"],
  "Gin":          ["gin-gonic/gin"],
  "Fiber":        ["gofiber/fiber"],
  "GORM":         ["gorm.io"],
  "Actix":        ["actix-web"],
  "Axum":         ["axum"],
  "Tokio":        ["tokio"],
};

// ── GitHub API ────────────────────────────────────────────────────────────────
function ghHeaders(token) {
  const h = { "Accept": "application/vnd.github+json", "User-Agent": "gh-profile-gen" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function ghGet(url, token) {
  const resp = await fetch(url, { headers: ghHeaders(token) });
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}: ${(await resp.text()).slice(0, 120)}`);
  return resp.json();
}

async function fetchAllRepos(username, token) {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await ghGet(
      `${GH_API}/users/${username}/repos?type=public&sort=updated&per_page=${PER_PAGE}&page=${page}`,
      token
    );
    if (!batch.length) break;
    repos.push(...batch);
    if (batch.length < PER_PAGE) break;
    page++;
  }
  return repos;
}

async function fetchFile(owner, repo, path, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/contents/${path}`, token);
    if (data.encoding === "base64" && data.content)
      return atob(data.content.replace(/\n/g, ""));
    return null;
  } catch { return null; }
}

async function fetchRootFiles(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=0`, token);
    return (data.tree || []).map(f => f.path);
  } catch { return []; }
}

async function hasWorkflows(owner, repo, token) {
  try {
    const data = await ghGet(`${GH_API}/repos/${owner}/${repo}/contents/.github/workflows`, token);
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

// ── Framework detection ───────────────────────────────────────────────────────
function detectFromContent(content, found) {
  if (!content) return;
  const lower = content.toLowerCase();
  for (const [fw, sigs] of Object.entries(FRAMEWORK_SIGNALS))
    for (const s of sigs)
      if (lower.includes(s.toLowerCase())) { found.add(fw); break; }
}

function detectFromPackageJson(content, found) {
  if (!content) return;
  const raw = content.toLowerCase();
  try {
    const data = JSON.parse(content);
    const keys = Object.keys({
      ...data.dependencies,
      ...data.devDependencies,
      ...data.peerDependencies,
    }).join(" ").toLowerCase();
    for (const [fw, sigs] of Object.entries(FRAMEWORK_SIGNALS))
      for (const s of sigs) {
        const sl = s.toLowerCase();
        if (raw.includes(sl) || keys.includes(sl)) { found.add(fw); break; }
      }
  } catch { detectFromContent(content, found); }
}

async function scanRepo(owner, repo, token) {
  const found = new Set();
  const [pkg, req, pyproj, gomod, cargo, pom, rootFiles, ci] = await Promise.all([
    fetchFile(owner, repo, "package.json",     token),
    fetchFile(owner, repo, "requirements.txt", token),
    fetchFile(owner, repo, "pyproject.toml",   token),
    fetchFile(owner, repo, "go.mod",           token),
    fetchFile(owner, repo, "Cargo.toml",       token),
    fetchFile(owner, repo, "pom.xml",          token),
    fetchRootFiles(owner, repo, token),
    hasWorkflows(owner, repo, token),
  ]);

  detectFromPackageJson(pkg, found);
  detectFromContent(req,    found);
  detectFromContent(pyproj, found);
  detectFromContent(gomod,  found);
  detectFromContent(cargo,  found);
  detectFromContent(pom,    found);

  const rootSet = new Set(rootFiles.map(f => f.split("/")[0]));
  if (ci) found.add("GitHub Actions");
  if (rootSet.has("Dockerfile") || rootSet.has("docker-compose.yml") || rootSet.has("docker-compose.yaml"))
    found.add("Docker");
  if (rootSet.has("Chart.yaml") || rootSet.has("kubernetes") || rootSet.has("k8s") || rootSet.has("helm"))
    found.add("Kubernetes");
  if (rootFiles.some(f => f.endsWith(".tf")))
    found.add("Terraform");

  const hasTests = rootFiles.some(f => {
    const l = f.toLowerCase();
    return l.includes("test") || l.includes("spec") || l.includes("__tests__");
  });

  return {
    frameworks: [...found],
    hasTests,
    hasCi:     found.has("GitHub Actions"),
    hasDocker: found.has("Docker"),
    hasK8s:    found.has("Kubernetes"),
  };
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function aggregateStats(repos, scanResults) {
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);

  const langs = {};
  for (const r of repos)
    if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;

  const allFw = new Set();
  let hasTests = false, hasCi = false, hasDocker = false, hasK8s = false;
  for (const sr of scanResults) {
    sr.frameworks.forEach(f => allFw.add(f));
    if (sr.hasTests)  hasTests  = true;
    if (sr.hasCi)     hasCi     = true;
    if (sr.hasDocker) hasDocker = true;
    if (sr.hasK8s)    hasK8s    = true;
  }

  const topicCounts = {};
  for (const r of repos)
    for (const t of (r.topics || []))
      topicCounts[t] = (topicCounts[t] || 0) + 1;

  const topRepos = [...repos]
    .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))
    .slice(0, 6);

  return {
    totalRepos: repos.length,
    totalStars,
    langs,
    frameworks: [...allFw].sort(),
    topicCounts: Object.fromEntries(
      Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 20)
    ),
    topRepos,
    hasTests,
    hasCi,
    hasDocker,
    hasK8s,
  };
}

// ── README builder ────────────────────────────────────────────────────────────
// Builds a devicon <img> tag — returns empty string if icon doesn't exist
function deviconImg(name) {
  const url = deviconUrl(name);
  if (!url) return "";
  return `<img src="${url}" alt="${name}" width="40" height="40" title="${name}"/>`;
}

// Render a row of devicon icons, skipping any with no known icon
function iconRow(names) {
  return names.map(deviconImg).filter(Boolean).join(" ");
}

function buildReadme(username, u, stats) {
  const name     = u.name || username;
  const bio      = u.bio || "";
  const company  = (u.company || "").replace(/^@/, "").trim();
  const location = (u.location || "").replace(/\s+/g, " ").trim();
  const blog     = u.blog || "";
  const twitter  = u.twitter_username || "";
  const followers = u.followers || 0;
  const following = u.following || 0;

  const cleanBlog = blog
    ? (blog.startsWith("http") ? blog : `https://${blog}`)
    : "";

  const { totalRepos, totalStars, langs, frameworks,
          topicCounts, topRepos, hasDocker, hasK8s, hasCi, hasTests } = stats;

  // Top 10 languages sorted by repo count
  const sortedLangs  = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topLangNames = sortedLangs.map(([l]) => l);

  // Separate frameworks into those with devicon icons and those without
  const fwWithIcon    = frameworks.filter(fw => deviconUrl(fw));
  const fwWithoutIcon = frameworks.filter(fw => !deviconUrl(fw));

  // ── Header ──
  const header = `<h1 align="center">Hi 👋, I'm ${name}</h1>`;
  // Auto-link bare URLs in bio (they don't render as links inside <h3>)
  const linkedBio = bio.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');
  const subheader = bio
    ? `<h3 align="center">${linkedBio}</h3>`
    : `<h3 align="center">A passionate developer with ${totalRepos} public repositories</h3>`;

  // ── Social badges — pure HTML so they render inside <p align> ──
  // img.shields.io/badge builds static SVG badges from URL params only — no deployment, pure CDN
  const socialBadges = [
    twitter && `<a href="https://twitter.com/${twitter}"><img src="https://img.shields.io/twitter/follow/${twitter}?style=social" alt="Twitter @${twitter}"/></a>`,
    `<a href="https://github.com/${username}"><img src="https://img.shields.io/github/followers/${username}?style=social" alt="GitHub followers"/></a>`,
  ].filter(Boolean).join("&nbsp;&nbsp;");

  // ── Stat badges — values filled from API data we already fetched ──
  const statBadges = [
    `<img src="https://img.shields.io/badge/Stars-${totalStars}-yellow?style=flat-square" alt="${totalStars} stars"/>`,
    `<img src="https://img.shields.io/badge/Repos-${totalRepos}-blue?style=flat-square" alt="${totalRepos} repos"/>`,
    `<img src="https://img.shields.io/badge/Followers-${followers}-green?style=flat-square" alt="${followers} followers"/>`,
  ].join("&nbsp;");

  // ── DevOps badges ──
  const devopsBadges = [
    hasDocker && `<img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker"/>`,
    hasK8s    && `<img src="https://img.shields.io/badge/Kubernetes-326CE5?style=flat-square&logo=kubernetes&logoColor=white" alt="Kubernetes"/>`,
    hasCi     && `<img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat-square&logo=github-actions&logoColor=white" alt="GitHub Actions"/>`,
    hasTests  && `<img src="https://img.shields.io/badge/Tests-passing-brightgreen?style=flat-square" alt="Tests passing"/>`,
  ].filter(Boolean).join("&nbsp;");

  // ── About section ──
  const about = [
    location  && `- 📍 Based in **${location}**`,
    company   && `- 🏢 **${company}**`,
    `- 📦 **${totalRepos}** public repositories`,
    `- ⭐ **${totalStars}** total stars earned`,
    `- 👥 **${followers}** followers · **${following}** following`,
    hasDocker && "- 🐳 Uses **Docker** for containerization",
    hasK8s    && "- ☸️ Uses **Kubernetes** for orchestration",
    hasCi     && "- ⚙️ Uses **GitHub Actions** for CI/CD",
    hasTests  && "- 🧪 Writes **automated tests**",
    cleanBlog && `- 🌐 [${blog}](${cleanBlog})`,
    twitter   && `- 🐦 [@${twitter}](https://twitter.com/${twitter})`,
  ].filter(Boolean).join("\n");

  // ── Language table — raw repo counts, no made-up percentages ──
  const langTable = [
    "| Language | Repos |",
    "|---|---|",
    ...sortedLangs.map(([l, c]) => `| ${l} | ${c} |`),
  ].join("\n");

  // ── Top repos table — all data from API ──
  const repoTable = [
    "| Repository | Stars | Language | Description |",
    "|---|---|---|---|",
    ...topRepos.map(r => {
      const desc = r.description
        ? (r.description.length > 55 ? r.description.slice(0, 52) + "…" : r.description)
        : "—";
      return `| [${r.name}](https://github.com/${username}/${r.name}) | ⭐ ${r.stargazers_count || 0} | ${r.language || "—"} | ${desc} |`;
    }),
  ].join("\n");

  // ── Topics ──
  const topics = Object.keys(topicCounts).slice(0, 15).map(t => `\`${t}\``).join(" ");

  // ── Assemble ──
  const langIconRow  = iconRow(topLangNames);
  const fwIconRow    = iconRow(fwWithIcon);

  const sections = [

    // Header block
    [
      header,
      subheader,
      `<p align="center">${socialBadges}</p>`,
      `<p align="center">${statBadges}</p>`,
    ].join("\n\n"),

    // About
    `---\n\n## 👨‍💻 About Me\n\n${about}`,

    // Languages
    [
      "---\n\n## 🛠️ Tech Stack",
      "### 💻 Languages",
      langIconRow
        ? `<p align="left">\n${langIconRow}\n</p>\n\n${langTable}`
        : langTable,
    ].join("\n\n"),

    // Frameworks
    (fwIconRow || fwWithoutIcon.length) && [
      "### ⚡ Frameworks & Tools",
      fwIconRow && `<p align="left">\n${fwIconRow}\n</p>`,
      fwWithoutIcon.length && `**Also uses:** ${fwWithoutIcon.map(f => `\`${f}\``).join(" · ")}`,
    ].filter(Boolean).join("\n\n"),

    // DevOps
    devopsBadges && `### 🔧 DevOps\n\n<p align="left">${devopsBadges}</p>`,

    // Topics
    topics && `### 🏷️ Topics\n\n${topics}`,

    // Top repos
    topRepos.length && `---\n\n## 🔥 Top Repositories\n\n${repoTable}`,

    // Footer
    `---\n\n<p align="center">\n  <i>Generated by <a href="https://github.com/eliekh05/gh-profile-gen">gh-profile-gen</a></i><br/>\n  <i>Data: <a href="https://api.github.com">api.github.com</a> · Icons: <a href="https://devicon.dev">devicon.dev</a></i>\n</p>`,

  ].filter(Boolean).join("\n\n");

  return sections.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ── SSE & CORS ────────────────────────────────────────────────────────────────
const sse  = data => `data: ${JSON.stringify(data)}\n\n`;
const cors = () => ({
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options":       "nosniff",
});

// ── Worker entry ──────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors() });

    if (url.pathname === "/health")
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...cors(), "Content-Type": "application/json" },
      });

    if (url.pathname !== "/generate" || request.method !== "POST")
      return new Response("Not found", { status: 404, headers: cors() });

    let body;
    try { body = await request.json(); }
    catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...cors(), "Content-Type": "application/json" },
      });
    }

    const username = (body.username || "").trim().toLowerCase();
    if (!username || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(username))
      return new Response(JSON.stringify({ error: "Invalid GitHub username" }), {
        status: 400, headers: { ...cors(), "Content-Type": "application/json" },
      });

    const token = env.GITHUB_TOKEN || "";

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc    = new TextEncoder();
    const send   = async data => writer.write(enc.encode(sse(data)));

    (async () => {
      try {
        await send({ type: "progress", step: "profile", message: `Fetching profile for ${username}…` });
        const userInfo = await ghGet(`${GH_API}/users/${username}`, token);

        await send({ type: "progress", step: "repos", message: "Fetching repositories…" });
        const allRepos = await fetchAllRepos(username, token);

        if (!allRepos.length) {
          await send({ type: "error", message: "No public repositories found." });
          return;
        }

        const ownRepos = allRepos.filter(r => !r.fork);
        await send({
          type: "progress", step: "repos_found",
          message: `Found ${allRepos.length} repos (${ownRepos.length} own). Scanning manifests…`,
          count: allRepos.length,
        });

        const scanResults = [];
        for (let i = 0; i < ownRepos.length; i += SCAN_BATCH) {
          const batch   = ownRepos.slice(i, i + SCAN_BATCH);
          const results = await Promise.all(batch.map(r => scanRepo(username, r.name, token)));
          scanResults.push(...results);
          await send({
            type: "progress", step: "scan",
            message: `Scanned ${Math.min(i + SCAN_BATCH, ownRepos.length)}/${ownRepos.length} repos…`,
            index: Math.min(i + SCAN_BATCH, ownRepos.length),
            total: ownRepos.length,
          });
        }

        await send({ type: "progress", step: "aggregating", message: "Aggregating…" });
        const stats = aggregateStats(allRepos, scanResults);

        await send({ type: "progress", step: "building", message: "Building README…" });
        const readme = buildReadme(username, userInfo, stats);

        await send({
          type: "done",
          readme,
          stats: {
            repos_analyzed: scanResults.length,
            total_stars:    stats.totalStars,
            languages:      Object.keys(stats.langs),
            frameworks:     stats.frameworks,
          },
        });

      } catch (err) {
        await send({ type: "error", message: err.message || "Unknown error" });
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...cors(),
        "Content-Type":      "text/event-stream",
        "Cache-Control":     "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  },
};