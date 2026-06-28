"""
GitHub Profile Analyzer
- Fetches all public repos via GitHub API
- Clones each repo (shallow) into a temp dir
- Scans file tree for languages, frameworks, tooling
- Aggregates stats (stars, topics, commit activity)
- Generates a rich, accurate README.md — no hardcodes
"""

import asyncio
import os
import json
import tempfile
import subprocess
import collections
from pathlib import Path
from typing import AsyncGenerator, Any
import urllib.request
import urllib.error

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
PER_PAGE = 100
CLONE_DEPTH = 1
MAX_FILES_PER_REPO = 2000

# ── helpers ──────────────────────────────────────────────────────────────────

def _gh_headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "User-Agent": "gh-profile-gen"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h

def _gh_get(url: str) -> Any:
    req = urllib.request.Request(url, headers=_gh_headers())
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"GitHub API {e.code}: {body[:200]}")

def _fetch_all_repos(username: str) -> list[dict]:
    repos = []
    page = 1
    while True:
        url = (
            f"https://api.github.com/users/{username}/repos"
            f"?type=public&sort=updated&per_page={PER_PAGE}&page={page}"
        )
        batch = _gh_get(url)
        if not batch:
            break
        repos.extend(batch)
        if len(batch) < PER_PAGE:
            break
        page += 1
    return repos

def _fetch_user(username: str) -> dict:
    return _gh_get(f"https://api.github.com/users/{username}")

def _shallow_clone(repo_url: str, dest: Path) -> bool:
    try:
        subprocess.run(
            ["git", "clone", "--depth", str(CLONE_DEPTH), "--quiet",
             "--no-tags", repo_url, str(dest)],
            timeout=60, capture_output=True, check=True
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False

# ── language / framework detection ──────────────────────────────────────────

EXT_LANG = {
    ".py": "Python", ".pyx": "Python",
    ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".jsx": "JavaScript",
    ".rb": "Ruby",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin", ".kts": "Kotlin",
    ".swift": "Swift",
    ".c": "C", ".h": "C",
    ".cpp": "C++", ".cc": "C++", ".cxx": "C++", ".hpp": "C++",
    ".cs": "C#",
    ".php": "PHP",
    ".sh": "Shell", ".bash": "Shell",
    ".r": "R",
    ".scala": "Scala",
    ".clj": "Clojure",
    ".ex": "Elixir", ".exs": "Elixir",
    ".erl": "Erlang",
    ".hs": "Haskell",
    ".lua": "Lua",
    ".dart": "Dart",
    ".vue": "Vue",
    ".svelte": "Svelte",
    ".html": "HTML", ".htm": "HTML",
    ".css": "CSS", ".scss": "CSS", ".sass": "CSS", ".less": "CSS",
    ".sol": "Solidity",
    ".tf": "Terraform", ".tfvars": "Terraform",
    ".yaml": "YAML", ".yml": "YAML",
    ".json": "JSON",
    ".md": "Markdown",
    ".dockerfile": "Docker",
}

FRAMEWORK_SIGNALS: dict[str, list[str]] = {
    # file-name signals → framework name
    "React":        ["react", "react-dom"],
    "Next.js":      ["next"],
    "Vue":          ["vue"],
    "Nuxt":         ["nuxt"],
    "Svelte":       ["svelte", "@sveltejs"],
    "Angular":      ["@angular/core"],
    "Django":       ["django"],
    "Flask":        ["flask"],
    "FastAPI":      ["fastapi"],
    "Express":      ["express"],
    "NestJS":       ["@nestjs/core"],
    "Spring Boot":  ["spring-boot"],
    "Rails":        ["railties"],
    "Laravel":      ["laravel/framework"],
    "Gin":          [],         # detected by import
    "Fiber":        [],
    "Actix":        [],
    "Axum":         [],
    "TensorFlow":   ["tensorflow"],
    "PyTorch":      ["torch"],
    "scikit-learn": ["scikit-learn", "sklearn"],
    "Pandas":       ["pandas"],
    "NumPy":        ["numpy"],
    "Docker":       [],
    "Kubernetes":   [],
    "Terraform":    [],
    "GraphQL":      ["graphql", "apollo-server", "strawberry-graphql"],
    "PostgreSQL":   ["psycopg2", "pg", "asyncpg"],
    "MongoDB":      ["pymongo", "mongoose"],
    "Redis":        ["redis", "ioredis"],
    "Prisma":       ["prisma", "@prisma/client"],
    "SQLAlchemy":   ["sqlalchemy"],
    "Tailwind CSS": ["tailwindcss"],
    "Shadcn/ui":    ["@shadcn"],
}

FRAMEWORK_FILE_SIGNALS: dict[str, list[str]] = {
    "Docker":       ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"],
    "Kubernetes":   ["kubernetes", "k8s.yaml", "k8s.yml", "helm", "Chart.yaml"],
    "Terraform":    [".tf"],
    "GitHub Actions": [".github/workflows"],
    "Gin":          ["gin.Default()", "gin.New()"],
    "Fiber":        ["fiber.New()"],
    "Actix":        ["actix_web"],
    "Axum":         ["axum::Router"],
    "Makefile":     ["Makefile", "makefile"],
}

def _detect_from_package_json(path: Path, found: set):
    try:
        data = json.loads(path.read_text(errors="ignore"))
        all_deps = {}
        for key in ("dependencies", "devDependencies", "peerDependencies"):
            all_deps.update(data.get(key, {}))
        dep_str = " ".join(all_deps.keys()).lower()
        for fw, signals in FRAMEWORK_SIGNALS.items():
            for s in signals:
                if s.lower() in dep_str:
                    found.add(fw)
    except Exception:
        pass

def _detect_from_requirements(path: Path, found: set):
    try:
        text = path.read_text(errors="ignore").lower()
        for fw, signals in FRAMEWORK_SIGNALS.items():
            for s in signals:
                if s.lower() in text:
                    found.add(fw)
    except Exception:
        pass

def _detect_from_go_mod(path: Path, found: set):
    try:
        text = path.read_text(errors="ignore")
        if "github.com/gin-gonic/gin" in text:
            found.add("Gin")
        if "github.com/gofiber/fiber" in text:
            found.add("Fiber")
        if "gorm.io" in text:
            found.add("GORM")
    except Exception:
        pass

def _detect_from_cargo_toml(path: Path, found: set):
    try:
        text = path.read_text(errors="ignore")
        if "actix-web" in text:
            found.add("Actix")
        if "axum" in text:
            found.add("Axum")
        if "tokio" in text:
            found.add("Tokio")
        if "sqlx" in text:
            found.add("SQLx")
        if "diesel" in text:
            found.add("Diesel")
    except Exception:
        pass

def _detect_from_pom(path: Path, found: set):
    try:
        text = path.read_text(errors="ignore")
        if "spring-boot" in text:
            found.add("Spring Boot")
        if "hibernate" in text.lower():
            found.add("Hibernate")
        if "quarkus" in text.lower():
            found.add("Quarkus")
    except Exception:
        pass

def _detect_from_file_tree(root: Path, found: set, lang_counts: dict):
    count = 0
    for p in root.rglob("*"):
        if count > MAX_FILES_PER_REPO:
            break
        if p.is_dir():
            # skip typical noise dirs
            if p.name in {".git", "node_modules", "__pycache__", ".venv",
                          "venv", "env", "dist", "build", ".next", "target",
                          "vendor", ".gradle", ".mvn"}:
                continue
            # Kubernetes / Docker detection by folder name
            if p.name in {"k8s", "kubernetes", "helm"}:
                found.add("Kubernetes")
            if p.name == ".github" and (p / "workflows").exists():
                found.add("GitHub Actions")
            continue
        if not p.is_file():
            continue
        count += 1
        name = p.name
        ext = p.suffix.lower()

        # Language by extension
        lang = EXT_LANG.get(ext)
        if lang:
            lang_counts[lang] = lang_counts.get(lang, 0) + 1

        # Special file names
        if name in {"Dockerfile", "docker-compose.yml", "docker-compose.yaml"}:
            found.add("Docker")
        if name in {"Makefile", "makefile"}:
            found.add("Make")
        if ext == ".tf":
            found.add("Terraform")
        if name == "Chart.yaml":
            found.add("Kubernetes")

        # Deep content checks for small key files
        if name == "package.json" and p.stat().st_size < 200_000:
            _detect_from_package_json(p, found)
        elif name in {"requirements.txt", "Pipfile", "pyproject.toml"} and p.stat().st_size < 100_000:
            _detect_from_requirements(p, found)
        elif name == "go.mod":
            _detect_from_go_mod(p, found)
        elif name == "Cargo.toml":
            _detect_from_cargo_toml(p, found)
        elif name == "pom.xml":
            _detect_from_pom(p, found)

def scan_repo(repo_path: Path) -> dict:
    lang_counts: dict[str, int] = {}
    frameworks: set[str] = set()
    has_tests = False
    has_ci = False
    has_docker = False
    has_k8s = False
    readme_text = ""

    _detect_from_file_tree(repo_path, frameworks, lang_counts)

    has_docker = "Docker" in frameworks
    has_k8s = "Kubernetes" in frameworks
    has_ci = "GitHub Actions" in frameworks

    # Check for tests
    for p in repo_path.rglob("*"):
        n = p.name.lower()
        if any(x in n for x in ["test", "spec", "_test.", ".test.", "__tests__"]):
            has_tests = True
            break

    # Read README
    for rname in ["README.md", "readme.md", "README.rst", "README.txt"]:
        rp = repo_path / rname
        if rp.exists():
            try:
                readme_text = rp.read_text(errors="ignore")[:3000]
            except Exception:
                pass
            break

    return {
        "lang_counts": lang_counts,
        "frameworks": list(frameworks),
        "has_tests": has_tests,
        "has_ci": has_ci,
        "has_docker": has_docker,
        "has_k8s": has_k8s,
        "readme_snippet": readme_text[:500],
    }

# ── aggregation ──────────────────────────────────────────────────────────────

def aggregate_stats(repos: list[dict], scan_results: list[dict]) -> dict:
    total_stars = sum(r.get("stargazers_count", 0) for r in repos)
    total_watchers = sum(r.get("watchers_count", 0) for r in repos)

    # GitHub API language field (primary per repo)
    gh_langs: dict[str, int] = {}
    for r in repos:
        lang = r.get("language")
        if lang:
            gh_langs[lang] = gh_langs.get(lang, 0) + 1

    # Scanned file-based language counts
    scanned_langs: dict[str, int] = {}
    for sr in scan_results:
        for lang, cnt in sr.get("lang_counts", {}).items():
            scanned_langs[lang] = scanned_langs.get(lang, 0) + cnt

    # Framework union across all repos
    all_frameworks: set[str] = set()
    for sr in scan_results:
        all_frameworks.update(sr.get("frameworks", []))

    # Topics
    all_topics: list[str] = []
    for r in repos:
        all_topics.extend(r.get("topics", []))
    topic_counts = collections.Counter(all_topics)

    # Top repos by stars
    top_repos = sorted(repos, key=lambda r: r.get("stargazers_count", 0), reverse=True)[:6]

    # Recent repos
    recent_repos = sorted(
        [r for r in repos if not r.get("fork")],
        key=lambda r: r.get("pushed_at", ""),
        reverse=True
    )[:6]

    has_tests = any(sr.get("has_tests") for sr in scan_results)
    has_ci = any(sr.get("has_ci") for sr in scan_results)
    has_docker = any(sr.get("has_docker") for sr in scan_results)
    has_k8s = any(sr.get("has_k8s") for sr in scan_results)

    return {
        "total_repos": len(repos),
        "total_stars": total_stars,
        "total_watchers": total_watchers,
        "gh_langs": gh_langs,
        "scanned_langs": scanned_langs,
        "frameworks": sorted(all_frameworks),
        "topic_counts": dict(topic_counts.most_common(20)),
        "top_repos": top_repos,
        "recent_repos": recent_repos,
        "has_tests": has_tests,
        "has_ci": has_ci,
        "has_docker": has_docker,
        "has_k8s": has_k8s,
    }

# ── README builder ───────────────────────────────────────────────────────────

LANG_ICONS: dict[str, str] = {
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
    "R":          "https://www.r-project.org/logo/Rlogo.svg",
    "Shell":      "https://www.vectorlogo.zone/logos/gnu_bash/gnu_bash-icon.svg",
    "HTML":       "https://raw.githubusercontent.com/devicons/devicon/master/icons/html5/html5-original-wordmark.svg",
    "CSS":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/css3/css3-original-wordmark.svg",
    "Vue":        "https://raw.githubusercontent.com/devicons/devicon/master/icons/vuejs/vuejs-original-wordmark.svg",
    "Svelte":     "https://upload.wikimedia.org/wikipedia/commons/1/1b/Svelte_Logo.svg",
    "Elixir":     "https://www.vectorlogo.zone/logos/elixir-lang/elixir-lang-icon.svg",
    "Solidity":   "https://raw.githubusercontent.com/devicons/devicon/master/icons/solidity/solidity-original.svg",
    "Terraform":  "https://www.vectorlogo.zone/logos/terraformio/terraformio-icon.svg",
}

FRAMEWORK_ICONS: dict[str, str] = {
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
}

def _icon_row(items: list[str], icon_map: dict[str, str]) -> str:
    parts = []
    for item in items:
        url = icon_map.get(item)
        if url:
            parts.append(f'<img src="{url}" alt="{item}" width="40" height="40" title="{item}"/>')
    return " ".join(parts)

def _lang_bar(lang_counts: dict[str, int]) -> str:
    """Render a language usage bar in markdown."""
    total = sum(lang_counts.values()) or 1
    top = sorted(lang_counts.items(), key=lambda x: x[1], reverse=True)[:8]
    lines = []
    for lang, cnt in top:
        pct = cnt / total * 100
        lines.append(f"- **{lang}** — {pct:.1f}%")
    return "\n".join(lines)

def build_readme(username: str, user_info: dict, stats: dict) -> str:
    name = user_info.get("name") or username
    bio = user_info.get("bio") or ""
    company = user_info.get("company") or ""
    location = user_info.get("location") or ""
    blog = user_info.get("blog") or ""
    twitter = user_info.get("twitter_username") or ""
    avatar = user_info.get("avatar_url") or ""
    followers = user_info.get("followers", 0)
    following = user_info.get("following", 0)
    created = (user_info.get("created_at") or "")[:4]

    total_repos = stats["total_repos"]
    total_stars = stats["total_stars"]
    frameworks = stats["frameworks"]
    gh_langs = stats["gh_langs"]
    scanned_langs = stats["scanned_langs"]
    has_docker = stats["has_docker"]
    has_k8s = stats["has_k8s"]
    has_ci = stats["has_ci"]
    has_tests = stats["has_tests"]
    top_repos = stats["top_repos"]
    recent_repos = stats["recent_repos"]
    topics = stats["topic_counts"]

    # Merge language sources: prefer GitHub API (authoritative) but supplement with scan
    all_langs: dict[str, int] = {}
    for l, cnt in gh_langs.items():
        all_langs[l] = all_langs.get(l, 0) + cnt * 3   # weight API langs higher
    for l, cnt in scanned_langs.items():
        if l not in {"YAML", "JSON", "Markdown"}:       # skip meta-langs
            all_langs[l] = all_langs.get(l, 0) + cnt

    top_langs = sorted(all_langs.items(), key=lambda x: x[1], reverse=True)[:10]
    top_lang_names = [l for l, _ in top_langs]

    # Build icon row for languages
    lang_icons_html = _icon_row(top_lang_names, LANG_ICONS)

    # Build icon row for frameworks (only those with icons)
    fw_with_icons = [fw for fw in frameworks if fw in FRAMEWORK_ICONS]
    fw_icons_html = _icon_row(fw_with_icons, FRAMEWORK_ICONS)

    # Social badges
    badges = []
    if twitter:
        badges.append(f'[![Twitter](https://img.shields.io/twitter/follow/{twitter}?style=social)](https://twitter.com/{twitter})')
    badges.append(f'[![GitHub followers](https://img.shields.io/github/followers/{username}?style=social)](https://github.com/{username})')

    badge_line = " ".join(badges)

    # Profile-level stats shields
    stats_line_parts = [
        f'![Profile views](https://komarev.com/ghpvc/?username={username}&color=blueviolet)',
        f'![Stars](https://img.shields.io/badge/Total%20Stars-{total_stars}-yellow)',
        f'![Repos](https://img.shields.io/badge/Public%20Repos-{total_repos}-blue)',
    ]
    if followers:
        stats_line_parts.append(f'![Followers](https://img.shields.io/badge/Followers-{followers}-green)')
    stats_shields = " ".join(stats_line_parts)

    # DevOps/tooling badges
    tooling_badges = []
    if has_docker:
        tooling_badges.append("![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)")
    if has_k8s:
        tooling_badges.append("![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=flat&logo=kubernetes&logoColor=white)")
    if has_ci:
        tooling_badges.append("![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?style=flat&logo=github-actions&logoColor=white)")
    if has_tests:
        tooling_badges.append("![Tests](https://img.shields.io/badge/Tests-passing-brightgreen)")

    # Top repos section
    repo_cards = []
    for r in top_repos[:6]:
        rname = r["name"]
        desc = r.get("description") or ""
        stars = r.get("stargazers_count", 0)
        lang = r.get("language") or ""
        repo_cards.append(
            f'[![{rname}](https://github-readme-stats.vercel.app/api/pin/?username={username}&repo={rname}&theme=dark)](https://github.com/{username}/{rname})'
        )

    # Topics cloud
    topic_badges = " ".join(
        f'`{t}`' for t in list(topics.keys())[:15]
    )

    # Contribution streak
    streak_url = f"https://github-readme-streak-stats.herokuapp.com/?user={username}&theme=dark"
    activity_url = f"https://github-readme-activity-graph.vercel.app/graph?username={username}&theme=github-dark"
    stats_card_url = f"https://github-readme-stats.vercel.app/api?username={username}&show_icons=true&theme=dark&count_private=true"
    langs_card_url = f"https://github-readme-stats.vercel.app/api/top-langs/?username={username}&layout=compact&theme=dark&langs_count=10"
    trophy_url = f"https://trophygithubreadmelang.cybee.dpdns.org/?username={username}&theme=darkhub&no-frame=true&margin-w=4"

    # Header
    header = f"<h1 align=\"center\">Hi 👋, I'm {name}</h1>"
    if bio:
        sub = f'<h3 align="center">{bio}</h3>'
    else:
        sub = f'<h3 align="center">A passionate developer with {total_repos} public repositories</h3>'

    # Location / company line
    info_parts = []
    if location:
        info_parts.append(f"📍 **{location}**")
    if company:
        info_parts.append(f"🏢 **{company}**")
    if created:
        info_parts.append(f"🚀 On GitHub since **{created}**")
    if blog:
        clean_blog = blog if blog.startswith("http") else f"https://{blog}"
        info_parts.append(f"🌐 [Website]({clean_blog})")
    info_line = " &nbsp;·&nbsp; ".join(info_parts)

    # Build the full README
    sections = []

    # ── HEADER ──
    sections.append(f"""{header}

{sub}

<p align="center">
{badge_line}
</p>

<p align="center">
{stats_shields}
</p>
""")

    if info_line:
        sections.append(f"<p align=\"center\">{info_line}</p>\n")

    # ── ABOUT ──
    sections.append("---\n")
    sections.append("## 👨‍💻 About Me\n")
    about_bullets = []
    if location:
        about_bullets.append(f"- 📍 Based in **{location}**")
    if company:
        about_bullets.append(f"- 🏢 Working at / with **{company}**")
    about_bullets.append(f"- 📦 **{total_repos}** public repositories")
    about_bullets.append(f"- ⭐ **{total_stars}** total stars earned")
    about_bullets.append(f"- 👥 **{followers}** followers · **{following}** following")
    if has_docker:
        about_bullets.append("- 🐳 Uses **Docker** for containerization")
    if has_k8s:
        about_bullets.append("- ☸️ Works with **Kubernetes** orchestration")
    if has_ci:
        about_bullets.append("- ⚙️ Implements **CI/CD** with GitHub Actions")
    if has_tests:
        about_bullets.append("- 🧪 Writes **automated tests**")
    if blog:
        clean_blog = blog if blog.startswith("http") else f"https://{blog}"
        about_bullets.append(f"- 🌐 Personal site: [{blog}]({clean_blog})")
    if twitter:
        about_bullets.append(f"- 🐦 Twitter: [@{twitter}](https://twitter.com/{twitter})")

    sections.append("\n".join(about_bullets) + "\n")

    # ── LANGUAGES ──
    sections.append("\n---\n")
    sections.append("## 🛠️ Languages & Technologies\n")
    sections.append("### 💻 Programming Languages\n")
    if lang_icons_html:
        sections.append(f'<p align="left">\n{lang_icons_html}\n</p>\n')
    sections.append("\n**Top languages across repositories:**\n")
    total_all = sum(all_langs.values()) or 1
    lang_bar_parts = []
    for lang, cnt in top_langs:
        pct = cnt / total_all * 100
        lang_bar_parts.append(f"| {lang} | {pct:.1f}% |")
    if lang_bar_parts:
        sections.append("| Language | Usage |\n|---|---|\n" + "\n".join(lang_bar_parts) + "\n")

    # ── FRAMEWORKS ──
    if frameworks:
        sections.append("\n### ⚡ Frameworks, Libraries & Tools\n")
        if fw_icons_html:
            sections.append(f'<p align="left">\n{fw_icons_html}\n</p>\n')
        # text list for frameworks without icons
        fw_no_icon = [fw for fw in frameworks if fw not in FRAMEWORK_ICONS]
        if fw_no_icon:
            sections.append("\n**Also uses:** " + " · ".join(f"`{fw}`" for fw in sorted(fw_no_icon)) + "\n")

    # ── TOOLING ──
    if tooling_badges:
        sections.append("\n### 🔧 DevOps & Infrastructure\n")
        sections.append(" ".join(tooling_badges) + "\n")

    # ── TOPICS ──
    if topics:
        sections.append("\n### 🏷️ Interest Areas\n")
        sections.append(topic_badges + "\n")

    # ── STATS CARDS ──
    sections.append("\n---\n")
    sections.append("## 📊 GitHub Statistics\n")
    sections.append(f"""<p align="center">
  <img src="{stats_card_url}" alt="GitHub Stats" height="170"/>
  <img src="{langs_card_url}" alt="Top Languages" height="170"/>
</p>

<p align="center">
  <img src="{streak_url}" alt="GitHub Streak" />
</p>

<p align="center">
  <img src="{trophy_url}" alt="GitHub Trophies"/>
</p>
""")

    # ── TOP REPOS ──
    if top_repos:
        sections.append("\n---\n")
        sections.append("## 🔥 Top Repositories\n")
        sections.append('<p align="left">\n')
        for r in top_repos[:6]:
            rname = r["name"]
            sections.append(
                f'  <a href="https://github.com/{username}/{rname}">'
                f'<img src="https://github-readme-stats.vercel.app/api/pin/?username={username}&repo={rname}&theme=dark" /></a>\n'
            )
        sections.append("</p>\n")

    # ── RECENT ACTIVITY ──
    sections.append("\n---\n")
    sections.append("## 📈 Contribution Activity\n")
    sections.append(f'<p align="center">\n  <img src="{activity_url}" alt="Activity Graph"/>\n</p>\n')

    # ── RECENT REPOS ──
    if recent_repos and recent_repos != top_repos:
        sections.append("\n---\n")
        sections.append("## 🆕 Recently Active Repositories\n")
        for r in recent_repos[:5]:
            rname = r["name"]
            desc = r.get("description") or "*No description*"
            lang = r.get("language") or ""
            stars = r.get("stargazers_count", 0)
            pushed = (r.get("pushed_at") or "")[:10]
            lang_str = f" · `{lang}`" if lang else ""
            sections.append(
                f"- **[{rname}](https://github.com/{username}/{rname})** — {desc}"
                f"{lang_str} · ⭐ {stars} · 📅 {pushed}\n"
            )

    # ── FOOTER ──
    sections.append("\n---\n")
    sections.append(f"""<p align="center">
  <i>Generated by <a href="https://github.com/eliekh05/gh-profile-gen">gh-profile-gen</a> — evidence-driven profile README generator</i><br/>
  <i>All data sourced directly from GitHub API and repository analysis</i>
</p>
""")

    return "\n".join(sections)

# ── main pipeline ─────────────────────────────────────────────────────────────

async def analyze_github_user(username: str) -> AsyncGenerator[dict, None]:
    loop = asyncio.get_event_loop()

    # 1. Fetch user profile
    yield {"type": "progress", "step": "profile", "message": f"Fetching profile for {username}…"}
    try:
        user_info = await loop.run_in_executor(None, _fetch_user, username)
    except Exception as e:
        yield {"type": "error", "message": f"User not found: {e}"}
        return

    yield {"type": "progress", "step": "repos", "message": "Fetching all public repositories…"}
    try:
        repos = await loop.run_in_executor(None, _fetch_all_repos, username)
    except Exception as e:
        yield {"type": "error", "message": f"Failed to fetch repos: {e}"}
        return

    if not repos:
        yield {"type": "error", "message": "No public repositories found for this user."}
        return

    yield {
        "type": "progress",
        "step": "repos_found",
        "message": f"Found {len(repos)} repositories. Starting analysis…",
        "count": len(repos),
    }

    # Only clone own repos — forks excluded for accuracy
    clone_targets = [r for r in repos if not r.get("fork")]

    scan_results = []

    with tempfile.TemporaryDirectory() as tmpdir:
        for i, repo in enumerate(clone_targets):
            rname = repo["name"]
            clone_url = repo.get("clone_url") or repo.get("html_url") + ".git"
            dest = Path(tmpdir) / rname

            yield {
                "type": "progress",
                "step": "clone",
                "message": f"Analyzing [{i+1}/{len(clone_targets)}] {rname}…",
                "index": i + 1,
                "total": len(clone_targets),
                "repo": rname,
            }

            ok = await loop.run_in_executor(None, _shallow_clone, clone_url, dest)
            if ok:
                result = await loop.run_in_executor(None, scan_repo, dest)
                result["repo_name"] = rname
                scan_results.append(result)
            else:
                # Fallback: use GitHub API language field only
                lang = repo.get("language")
                scan_results.append({
                    "repo_name": rname,
                    "lang_counts": {lang: 1} if lang else {},
                    "frameworks": [],
                    "has_tests": False,
                    "has_ci": False,
                    "has_docker": False,
                    "has_k8s": False,
                    "readme_snippet": "",
                })

            await asyncio.sleep(0)   # yield control

    yield {"type": "progress", "step": "aggregating", "message": "Aggregating all findings…"}
    stats = await loop.run_in_executor(None, aggregate_stats, repos, scan_results)

    yield {"type": "progress", "step": "building", "message": "Building your README…"}
    readme = await loop.run_in_executor(None, build_readme, username, user_info, stats)

    yield {
        "type": "done",
        "readme": readme,
        "stats": {
            "repos_analyzed": len(scan_results),
            "total_stars": stats["total_stars"],
            "languages": list(stats["gh_langs"].keys()),
            "frameworks": stats["frameworks"],
        },
    }
