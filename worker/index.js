/**
 * gh-profile-gen — Cloudflare Worker (full backend)
 *
 * No Railway. No Python. No git clone.
 * Uses the GitHub Contents API to fetch key manifest files per repo
 * for framework detection — faster and Workers-compatible.
 *
 * Flow: POST /generate → SSE stream → done event with readme + stats
 */

const PER_PAGE       = 100;
const CACHE_TTL      = 3600;
const SCAN_BATCH     = 5; // repos to scan in parallel

// ── Language map ──────────────────────────────────────────────────────────────
const EXT_LANG = {
  ".py":"Python",".pyx":"Python",
  ".js":"JavaScript",".mjs":"JavaScript",".cjs":"JavaScript",".jsx":"JavaScript",
  ".ts":"TypeScript",".tsx":"TypeScript",
  ".rb":"Ruby",".go":"Go",".rs":"Rust",".java":"Java",
  ".kt":"Kotlin",".kts":"Kotlin",".swift":"Swift",
  ".c":"C",".h":"C",".cpp":"C++",".cc":"C++",".cxx":"C++",".hpp":"C++",
  ".cs":"C#",".php":"PHP",".sh":"Shell",".bash":"Shell",".r":"R",
  ".scala":"Scala",".clj":"Clojure",".ex":"Elixir",".exs":"Elixir",
  ".erl":"Erlang",".hs":"Haskell",".lua":"Lua",".dart":"Dart",
  ".vue":"Vue",".svelte":"Svelte",".html":"HTML",".htm":"HTML",
  ".css":"CSS",".scss":"CSS",".sass":"CSS",".less":"CSS",
  ".sol":"Solidity",".tf":"Terraform",".tfvars":"Terraform",
};

// ── Framework signals ─────────────────────────────────────────────────────────
const FRAMEWORK_SIGNALS = {
  "React":        ['"react"','"react-dom"'],
  "Next.js":      ['"next"'],
  "Vue":          ['"vue"'],
  "Nuxt":         ['"nuxt"'],
  "Svelte":       ['"svelte"',"@sveltejs"],
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
  "scikit-learn": ["scikit-learn","sklearn"],
  "Pandas":       ["pandas"],
  "NumPy":        ["numpy"],
  "GraphQL":      ["graphql","apollo-server","strawberry-graphql"],
  "PostgreSQL":   ["psycopg2",'"pg"',"asyncpg"],
  "MongoDB":      ["pymongo","mongoose"],
  "Redis":        ["redis","ioredis"],
  "Prisma":       ["prisma","@prisma/client"],
  "SQLAlchemy":   ["sqlalchemy"],
  "Tailwind CSS": ["tailwindcss"],
  "Gin":          ["gin-gonic/gin"],
  "Fiber":        ["gofiber/fiber"],
  "GORM":         ["gorm.io"],
  "Actix":        ["actix-web"],
  "Axum":         ["axum"],
  "Tokio":        ["tokio"],
  "SQLx":         ["sqlx"],
  "Diesel":       ["diesel"],
  "Hibernate":    ["hibernate"],
  "Quarkus":      ["quarkus"],
};

const LANG_ICONS = {
  "Python":     "https://raw.githubusercontent.com/devicons/devicon/master/icons/python/python-original.svg",
  "JavaScript": "https://raw.githubusercontent.com/devicons/devicon/master/icons/javascript/javascript-original.svg",
  "TypeScript": "https://raw.githubusercontent.com/devicons/devicon/master/icons/typescript/typescript-original.svg",
  "Go":         "https://raw.githubusercontent.com/devicons/devicon/master/icons/go/go-original.svg",
  "Rust":       "https://raw.githubusercontent.com/devicons/devicon/master/icons/rust/rust-plain.svg",
  "Java":       "https://raw.githubusercontent.com/devicons/devicon/master/icons/java/java-original.svg",
  "Kotlin":     "https://www.vectorlogo.zone/logos/kotlinlang/kotlinlang-icon.svg",
  "C":          "https://raw.githubusercontent.com/devicons/devicon/master/icons/c/c-original.svg",
  "C++":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/cplusplus/cplusplus-original.svg",
  "C#":         "https://raw.githubusercontent.com/devicons/devicon/master/icons/csharp/csharp-original.svg",
  "Ruby":       "https://raw.githubusercontent.com/devicons/devicon/master/icons/ruby/ruby-original.svg",
  "PHP":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/php/php-original.svg",
  "Swift":      "https://raw.githubusercontent.com/devicons/devicon/master/icons/swift/swift-original.svg",
  "Dart":       "https://www.vectorlogo.zone/logos/dartlang/dartlang-icon.svg",
  "Scala":      "https://raw.githubusercontent.com/devicons/devicon/master/icons/scala/scala-original.svg",
  "Shell":      "https://www.vectorlogo.zone/logos/gnu_bash/gnu_bash-icon.svg",
  "HTML":       "https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original-wordmark.svg",
  "CSS":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/css3/css3-original-wordmark.svg",
  "Vue":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/vuejs/vuejs-original-wordmark.svg",
  "Svelte":     "https://upload.wikimedia.org/wikipedia/commons/1/1b/Svelte_Logo.svg",
  "Elixir":     "https://www.vectorlogo.zone/logos/elixir-lang/elixir-lang-icon.svg",
  "Solidity":   "https://raw.githubusercontent.com/devicons/devicon/master/icons/solidity/solidity-original.svg",
  "Terraform":  "https://www.vectorlogo.zone/logos/terraformio/terraformio-icon.svg",
};

const FRAMEWORK_ICONS = {
  "React":          "https://raw.githubusercontent.com/devicons/devicon/master/icons/react/react-original-wordmark.svg",
  "Next.js":        "https://cdn.worldvectorlogo.com/logos/nextjs-2.svg",
  "Vue":            "https://raw.githubusercontent.com/devicons/devicon/master/icons/vuejs/vuejs-original-wordmark.svg",
  "Nuxt":           "https://www.vectorlogo.zone/logos/nuxtjs/nuxtjs-icon.svg",
  "Angular":        "https://angular.io/assets/images/logos/angular/angular.svg",
  "Svelte":         "https://upload.wikimedia.org/wikipedia/commons/1/1b/Svelte_Logo.svg",
  "Django":         "https://cdn.worldvectorlogo.com/logos/django.svg",
  "Flask":          "https://www.vectorlogo.zone/logos/pocoo_flask/pocoo_flask-icon.svg",
  "FastAPI":        "https://fastapi.tiangolo.com/img/logo-margin/logo-teal.png",
  "Express":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/express/express-original-wordmark.svg",
  "NestJS":         "https://raw.githubusercontent.com/devicons/devicon/master/icons/nestjs/nestjs-plain.svg",
  "Spring Boot":    "https://www.vectorlogo.zone/logos/springio/springio-icon.svg",
  "Rails":          "https://raw.githubusercontent.com/devicons/devicon/master/icons/rails/rails-original-wordmark.svg",
  "Laravel":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/laravel/laravel-plain-wordmark.svg",
  "Gin":            "https://raw.githubusercontent.com/devicons/devicon/master/icons/go/go-original.svg",
  "TensorFlow":     "https://www.vectorlogo.zone/logos/tensorflow/tensorflow-icon.svg",
  "PyTorch":        "https://www.vectorlogo.zone/logos/pytorch/pytorch-icon.svg",
  "Docker":         "https://raw.githubusercontent.com/devicons/devicon/master/icons/docker/docker-original-wordmark.svg",
  "Kubernetes":     "https://www.vectorlogo.zone/logos/kubernetes/kubernetes-icon.svg",
  "Terraform":      "https://www.vectorlogo.zone/logos/terraformio/terraformio-icon.svg",
  "GitHub Actions": "https://avatars.githubusercontent.com/u/44036562",
  "PostgreSQL":     "https://raw.githubusercontent.com/devicons/devicon/master/icons/postgresql/postgresql-original-wordmark.svg",
  "MongoDB":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/mongodb/mongodb-original-wordmark.svg",
  "Redis":          "https://raw.githubusercontent.com/devicons/devicon/master/icons/redis/redis-original-wordmark.svg",
  "Tailwind CSS":   "https://www.vectorlogo.zone/logos/tailwindcss/tailwindcss-icon.svg",
  "GraphQL":        "https://www.vectorlogo.zone/logos/graphql/graphql-icon.svg",
};

// ── GitHub API ────────────────────────────────────────────────────────────────
function ghHeaders(token) {
  const h = { "Accept": "application/vnd.github+json", "User-Agent": "gh-profile-gen" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function ghGet(url, token) {
  const resp = await fetch(url, { headers: ghHeaders(token) });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`GitHub ${resp.status}: ${body.slice(0, 120)}`);
  }
  return resp.json();
}

async function fetchUser(username, token) {
  return ghGet(`https://api.github.com/users/${username}`, token);
}

async function fetchAllRepos(username, token) {
  const repos = [];
  let page = 1;
  while (true) {
    const batch = await ghGet(
      `https://api.github.com/users/${username}/repos?type=public&sort=updated&per_page=${PER_PAGE}&page=${page}`,
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
    const data = await ghGet(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, token);
    if (data.encoding === "base64" && data.content) {
      return atob(data.content.replace(/\n/g, ""));
    }
    return null;
  } catch { return null; }
}

async function fetchRootFiles(owner, repo, token) {
  try {
    const data = await ghGet(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=0`, token);
    return (data.tree || []).map(f => f.path);
  } catch { return []; }
}

async function hasWorkflows(owner, repo, token) {
  try {
    const data = await ghGet(`https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`, token);
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

// ── Framework detection ───────────────────────────────────────────────────────
function detectFromContent(content, frameworks) {
  if (!content) return;
  const lower = content.toLowerCase();
  for (const [fw, signals] of Object.entries(FRAMEWORK_SIGNALS)) {
    for (const sig of signals) {
      if (lower.includes(sig.toLowerCase())) { frameworks.add(fw); break; }
    }
  }
}

function detectFromPackageJson(content, frameworks) {
  if (!content) return;
  // Match against raw JSON content so quoted signals like '"react"' match correctly.
  // Also build a plain key string as fallback for unquoted signals.
  const raw = content.toLowerCase();
  try {
    const data = JSON.parse(content);
    const keys = Object.keys({ ...data.dependencies, ...data.devDependencies, ...data.peerDependencies }).join(" ").toLowerCase();
    for (const [fw, signals] of Object.entries(FRAMEWORK_SIGNALS)) {
      for (const sig of signals) {
        const s = sig.toLowerCase();
        if (raw.includes(s) || keys.includes(s)) { frameworks.add(fw); break; }
      }
    }
  } catch { detectFromContent(content, frameworks); }
}

async function scanRepo(owner, repo, token) {
  const frameworks = new Set();
  const [pkgJson, req, pyproj, goMod, cargo, pom, rootFiles, ci] = await Promise.all([
    fetchFile(owner, repo, "package.json",     token),
    fetchFile(owner, repo, "requirements.txt", token),
    fetchFile(owner, repo, "pyproject.toml",   token),
    fetchFile(owner, repo, "go.mod",           token),
    fetchFile(owner, repo, "Cargo.toml",       token),
    fetchFile(owner, repo, "pom.xml",          token),
    fetchRootFiles(owner, repo, token),
    hasWorkflows(owner, repo, token),
  ]);

  detectFromPackageJson(pkgJson, frameworks);
  detectFromContent(req,     frameworks);
  detectFromContent(pyproj,  frameworks);
  detectFromContent(goMod,   frameworks);
  detectFromContent(cargo,   frameworks);
  detectFromContent(pom,     frameworks);

  const rootSet = new Set(rootFiles.map(f => f.split("/")[0]));
  if (ci)                                                                      frameworks.add("GitHub Actions");
  if (rootSet.has("Dockerfile")||rootSet.has("docker-compose.yml")||rootSet.has("docker-compose.yaml")) frameworks.add("Docker");
  if (rootSet.has("Chart.yaml")||rootSet.has("kubernetes")||rootSet.has("k8s")||rootSet.has("helm"))    frameworks.add("Kubernetes");
  if (rootFiles.some(f => f.endsWith(".tf")))                                  frameworks.add("Terraform");

  const hasTests  = rootFiles.some(f => { const l=f.toLowerCase(); return l.includes("test")||l.includes("spec")||l.includes("__tests__"); });
  const hasCi     = frameworks.has("GitHub Actions");
  const hasDocker = frameworks.has("Docker");
  const hasK8s    = frameworks.has("Kubernetes");

  return { frameworks: [...frameworks], hasTests, hasCi, hasDocker, hasK8s };
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function aggregateStats(repos, scanResults) {
  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count||0), 0);
  const ghLangs = {};
  for (const r of repos) if (r.language) ghLangs[r.language] = (ghLangs[r.language]||0) + 1;

  const allFw = new Set();
  let hasTests=false, hasCi=false, hasDocker=false, hasK8s=false;
  for (const sr of scanResults) {
    sr.frameworks.forEach(f => allFw.add(f));
    if (sr.hasTests)  hasTests=true;
    if (sr.hasCi)     hasCi=true;
    if (sr.hasDocker) hasDocker=true;
    if (sr.hasK8s)    hasK8s=true;
  }

  const topicCounts = {};
  for (const r of repos) for (const t of (r.topics||[])) topicCounts[t]=(topicCounts[t]||0)+1;
  const sortedTopics = Object.fromEntries(Object.entries(topicCounts).sort((a,b)=>b[1]-a[1]).slice(0,20));

  const topRepos    = [...repos].sort((a,b)=>(b.stargazers_count||0)-(a.stargazers_count||0)).slice(0,6);
  const recentRepos = repos.filter(r=>!r.fork).sort((a,b)=>(b.pushed_at||"").localeCompare(a.pushed_at||"")).slice(0,6);

  return { totalRepos:repos.length, totalStars, ghLangs, frameworks:[...allFw].sort(),
           topicCounts:sortedTopics, topRepos, recentRepos, hasTests, hasCi, hasDocker, hasK8s };
}

// ── README builder ────────────────────────────────────────────────────────────
function iconRow(items, map) {
  return items.filter(i=>map[i]).map(i=>`<img src="${map[i]}" alt="${i}" width="40" height="40" title="${i}"/>`).join(" ");
}

function buildReadme(username, u, stats) {
  const name=u.name||username, bio=u.bio||"", company=u.company||"",
        location=u.location||"", blog=u.blog||"", twitter=u.twitter_username||"",
        followers=u.followers||0, following=u.following||0, created=(u.created_at||"").slice(0,4);

  const { totalRepos, totalStars, ghLangs, frameworks, topicCounts,
          topRepos, recentRepos, hasDocker, hasK8s, hasCi, hasTests } = stats;

  const sortedLangs  = Object.entries(ghLangs).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const totalLangCnt = sortedLangs.reduce((s,[,c])=>s+c,0)||1;
  const topLangNames = sortedLangs.map(([l])=>l);

  const fwWithIcons    = frameworks.filter(fw=>FRAMEWORK_ICONS[fw]);
  const fwWithoutIcons = frameworks.filter(fw=>!FRAMEWORK_ICONS[fw]);

  const badges = [
    twitter ? `[![Twitter](https://img.shields.io/twitter/follow/${twitter}?style=social)](https://twitter.com/${twitter})` : "",
    `[![GitHub followers](https://img.shields.io/github/followers/${username}?style=social)](https://github.com/${username})`,
  ].filter(Boolean).join(" ");

  const statsShields = [
    `![Profile views](https://komarev.com/ghpvc/?username=${username}&color=blueviolet)`,
    `![Stars](https://img.shields.io/badge/Total%20Stars-${totalStars}-yellow)`,
    `![Repos](https://img.shields.io/badge/Public%20Repos-${totalRepos}-blue)`,
    followers ? `![Followers](https://img.shields.io/badge/Followers-${followers}-green)` : "",
  ].filter(Boolean).join(" ");

  const toolingBadges = [
    hasDocker ? "![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)"             : "",
    hasK8s    ? "![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=flat&logo=kubernetes&logoColor=white)" : "",
    hasCi     ? "![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat&logo=github-actions&logoColor=white)" : "",
    hasTests  ? "![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)"                                         : "",
  ].filter(Boolean).join(" ");

  const cleanBlog = blog ? (blog.startsWith("http") ? blog : `https://${blog}`) : "";
  const streakUrl   = `https://streak-stats.demolab.com/?user=${username}&theme=dark`;
  const activityUrl = `https://github-readme-activity-graph.vercel.app/graph?username=${username}&theme=github-dark`;
  const statsUrl    = `https://github-readme-stats.vercel.app/api?username=${username}&show_icons=true&theme=dark&count_private=true&hide_border=true`;
  const langsUrl    = `https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&layout=compact&theme=dark&langs_count=10&hide_border=true`;
  const trophyUrl   = `https://trophygithubreadmelang.cybee.dpdns.org/?username=${username}&theme=darkhub&no-frame=true&margin-w=4`;

  const header = `<h1 align="center">Hi 👋, I'm ${name}</h1>`;
  const sub    = bio ? `<h3 align="center">${bio}</h3>` : `<h3 align="center">A passionate developer with ${totalRepos} public repositories</h3>`;

  const about = [
    location  ? `- 📍 Based in **${location}**`                         : "",
    company   ? `- 🏢 Working at / with **${company}**`                 : "",
    `- 📦 **${totalRepos}** public repositories`,
    `- ⭐ **${totalStars}** total stars earned`,
    `- 👥 **${followers}** followers · **${following}** following`,
    hasDocker ? "- 🐳 Uses **Docker** for containerization"             : "",
    hasK8s    ? "- ☸️ Works with **Kubernetes** orchestration"          : "",
    hasCi     ? "- ⚙️ Implements **CI/CD** with GitHub Actions"         : "",
    hasTests  ? "- 🧪 Writes **automated tests**"                       : "",
    cleanBlog ? `- 🌐 Personal site: [${blog}](${cleanBlog})`           : "",
    twitter   ? `- 🐦 Twitter: [@${twitter}](https://twitter.com/${twitter})` : "",
  ].filter(Boolean).join("\n");

  const langTable = [
    "| Language | Usage |", "|---|---|",
    ...sortedLangs.map(([l,c]) => `| ${l} | ${(c/totalLangCnt*100).toFixed(1)}% |`),
  ].join("\n");

  const topRepoCards = topRepos.slice(0,6).map(r =>
    `  <a href="https://github.com/${username}/${r.name}"><img src="https://github-readme-stats.vercel.app/api/pin/?username=${username}&repo=${r.name}&theme=dark" /></a>`
  ).join("\n");

  const topNames = new Set(topRepos.map(r=>r.name));
  const recentList = recentRepos.filter(r=>!topNames.has(r.name)).slice(0,5).map(r => {
    const desc   = r.description || "*No description*";
    const lang   = r.language ? ` · \`${r.language}\`` : "";
    const pushed = (r.pushed_at||"").slice(0,10);
    return `- **[${r.name}](https://github.com/${username}/${r.name})** — ${desc}${lang} · ⭐ ${r.stargazers_count||0} · 📅 ${pushed}`;
  }).join("\n");

  const topicBadges = Object.keys(topicCounts).slice(0,15).map(t=>`\`${t}\``).join(" ");

  const sections = [
    `${header}\n\n${sub}\n\n<p align="center">\n${badges}\n</p>\n\n<p align="center">\n${statsShields}\n</p>`,
    `---\n\n## 👨‍💻 About Me\n\n${about}`,
    `---\n\n## 🛠️ Languages & Technologies\n\n### 💻 Programming Languages\n\n${iconRow(topLangNames,LANG_ICONS) ? `<p align="left">\n${iconRow(topLangNames,LANG_ICONS)}\n</p>\n\n` : ""}**Top languages across repositories:**\n\n${langTable}`,
    frameworks.length ? [
      "### ⚡ Frameworks, Libraries & Tools",
      fwWithIcons.length ? `<p align="left">\n${iconRow(fwWithIcons,FRAMEWORK_ICONS)}\n</p>` : "",
      fwWithoutIcons.length ? `**Also uses:** ${fwWithoutIcons.map(fw=>`\`${fw}\``).join(" · ")}` : "",
    ].filter(Boolean).join("\n\n") : "",
    toolingBadges ? `### 🔧 DevOps & Infrastructure\n\n${toolingBadges}` : "",
    topicBadges   ? `### 🏷️ Interest Areas\n\n${topicBadges}` : "",
    `---\n\n## 📊 GitHub Statistics\n\n<p align="center">\n  <img src="${statsUrl}" alt="GitHub Stats" height="170"/>\n  <img src="${langsUrl}" alt="Top Languages" height="170"/>\n</p>\n\n<p align="center">\n  <img src="${streakUrl}" alt="GitHub Streak" />\n</p>\n\n<p align="center">\n  <img src="${trophyUrl}" alt="GitHub Trophies"/>\n</p>`,
    topRepos.length ? `---\n\n## 🔥 Top Repositories\n\n<p align="left">\n${topRepoCards}\n</p>` : "",
    `---\n\n## 📈 Contribution Activity\n\n<p align="center">\n  <img src="${activityUrl}" alt="Activity Graph"/>\n</p>`,
    recentList ? `---\n\n## 🆕 Recently Active Repositories\n\n${recentList}` : "",
    `---\n\n<p align="center">\n  <i>Generated by <a href="https://github.com/eliekh05/gh-profile-gen">gh-profile-gen</a> — evidence-driven profile README generator</i><br/>\n  <i>All data sourced directly from GitHub API and repository analysis</i>\n</p>`,
  ].filter(Boolean);

  return sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ── SSE & CORS ────────────────────────────────────────────────────────────────
const sse = data => `data: ${JSON.stringify(data)}\n\n`;
const cors = () => ({
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "X-Content-Type-Options":       "nosniff",
});

// ── Main ──────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: cors() });

    if (url.pathname === "/health")
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...cors(), "Content-Type": "application/json" },
      });

    if (url.pathname !== "/generate" || request.method !== "POST")
      return new Response("Not found", { status: 404, headers: cors() });


    // Parse body
    let body;
    try { body = await request.json(); } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400, headers: { ...cors(), "Content-Type": "application/json" },
      });
    }
    const username = (body.username || "").trim().toLowerCase();
    if (!username || !/^[a-zA-Z0-9-]+$/.test(username))
      return new Response(JSON.stringify({ error: "Invalid username" }), {
        status: 400, headers: { ...cors(), "Content-Type": "application/json" },
      });

    const token = env.GITHUB_TOKEN || "";

    // Cache check
    const cacheKey = `readme:${username}`;
    if (env.CACHE) {
      const cached = await env.CACHE.get(cacheKey);
      if (cached) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const enc    = new TextEncoder();
        ctx.waitUntil((async () => {
          await writer.write(enc.encode(sse({ type:"progress", step:"cache", message:"Serving from cache…" })));
          await writer.write(enc.encode(`data: ${cached}\n\n`));
          await writer.close();
        })());
        return new Response(readable, {
          headers: { ...cors(), "Content-Type":"text/event-stream", "Cache-Control":"no-cache", "X-Cache":"HIT" },
        });
      }
    }

    // Stream analysis
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc    = new TextEncoder();
    const send   = async d => writer.write(enc.encode(sse(d)));

    ctx.waitUntil((async () => {
      try {
        await send({ type:"progress", step:"profile", message:`Fetching profile for ${username}…` });
        const userInfo = await fetchUser(username, token);

        await send({ type:"progress", step:"repos", message:"Fetching all public repositories…" });
        const allRepos = await fetchAllRepos(username, token);
        if (!allRepos.length) { await send({ type:"error", message:"No public repos found." }); return; }

        const ownRepos = allRepos.filter(r => !r.fork);
        await send({ type:"progress", step:"repos_found", message:`Found ${allRepos.length} repos (${ownRepos.length} own). Scanning manifests…`, count:allRepos.length });

        // Scan in batches of SCAN_BATCH
        const scanResults = [];
        for (let i = 0; i < ownRepos.length; i += SCAN_BATCH) {
          const batch = ownRepos.slice(i, i + SCAN_BATCH);
          const results = await Promise.all(batch.map(r => scanRepo(username, r.name, token)));
          scanResults.push(...results);
          await send({
            type:"progress", step:"scan",
            message:`Scanned ${Math.min(i+SCAN_BATCH, ownRepos.length)}/${ownRepos.length} repositories…`,
            index:Math.min(i+SCAN_BATCH, ownRepos.length), total:ownRepos.length,
          });
        }

        await send({ type:"progress", step:"aggregating", message:"Aggregating findings…" });
        const stats = aggregateStats(allRepos, scanResults);

        await send({ type:"progress", step:"building", message:"Building your README…" });
        const readme = buildReadme(username, userInfo, stats);

        const done = {
          type:"done", readme,
          stats:{
            repos_analyzed: scanResults.length,
            total_stars:    stats.totalStars,
            languages:      Object.keys(stats.ghLangs),
            frameworks:     stats.frameworks,
          },
        };

        if (env.CACHE)
          ctx.waitUntil(env.CACHE.put(cacheKey, JSON.stringify(done), { expirationTtl: CACHE_TTL }));

        await send(done);
      } catch(err) {
        await send({ type:"error", message: err.message || "Unknown error" });
      } finally {
        await writer.close();
      }
    })());

    return new Response(readable, {
      headers: { ...cors(), "Content-Type":"text/event-stream", "Cache-Control":"no-cache", "X-Accel-Buffering":"no", "X-Cache":"MISS" },
    });
  },
};
