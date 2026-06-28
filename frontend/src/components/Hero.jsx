import React, { useEffect, useRef } from "react";

export default function Hero() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.5,
      color: Math.random() > 0.5 ? "#39d353" : "#58a6ff",
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x = (p.x + p.vx + canvas.width) % canvas.width;
        p.y = (p.y + p.vy + canvas.height) % canvas.height;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 80) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = "#39d353";
            ctx.globalAlpha = (1 - d / 80) * 0.2;
            ctx.lineWidth = 0.5;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <header style={styles.hero}>
      <canvas ref={canvasRef} style={styles.canvas} />
      <div style={styles.overlay} />

      <div style={styles.content}>
        <div style={styles.badge}>
          <span style={styles.badgeDot} />
          Evidence-driven · No hardcodes · All repos analyzed
        </div>

        <h1 style={styles.title}>
          <span style={styles.titleAccent}>GitHub Profile</span>
          <br />
          README Generator
        </h1>

        <p style={styles.subtitle}>
          Clones <em>all</em> your public repos, analyzes every file, detects
          languages and frameworks from real evidence, and generates a rich,
          accurate profile README — no forms, no manual selection.
        </p>

        <strong>
          I recommend checking the readme by previewing on github for issues and
          fixing them due to the automated nature of the generator.
        </strong>

        <div style={styles.featureGrid}>
          {FEATURES.map((f) => (
            <div key={f.label} style={styles.featureCard}>
              <span style={styles.featureIcon}>{f.icon}</span>
              <div>
                <div style={styles.featureLabel}>{f.label}</div>
                <div style={styles.featureDesc}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}

const FEATURES = [
  {
    icon: "🔍",
    label: "Deep scan",
    desc: "Shallow-clones every repo, reads package.json, go.mod, Cargo.toml, requirements.txt…",
  },
  {
    icon: "🧠",
    label: "Smart detect",
    desc: "Identifies 40+ frameworks from dependency files, not just file extensions",
  },
  {
    icon: "📊",
    label: "Real stats",
    desc: "Stars, forks, watchers, commit streaks — sourced from GitHub API",
  },
  {
    icon: "✍️",
    label: "Rich README",
    desc: "GitHub stat cards, trophy wall, streak, activity graph, top repos, language bars",
  },
];

const styles = {
  hero: {
    position: "relative",
    overflow: "hidden",
    padding: "80px 24px 60px",
    textAlign: "center",
    background: "linear-gradient(180deg, #050811 0%, #080c10 100%)",
    borderBottom: "1px solid #21262d",
  },
  canvas: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    pointerEvents: "none",
  },
  overlay: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(57,211,83,0.06) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  content: {
    position: "relative",
    maxWidth: 860,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 28,
    animation: "fadeIn 0.6s ease both",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 16px",
    background: "rgba(57, 211, 83, 0.08)",
    border: "1px solid rgba(57, 211, 83, 0.2)",
    borderRadius: 999,
    fontSize: 12,
    fontFamily: "var(--font-mono)",
    color: "#39d353",
    letterSpacing: "0.04em",
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#39d353",
    animation: "pulse 2s infinite",
    display: "inline-block",
  },
  title: {
    fontSize: "clamp(2.2rem, 6vw, 4rem)",
    fontWeight: 800,
    fontFamily: "var(--font-sans)",
    lineHeight: 1.1,
    letterSpacing: "-0.02em",
    color: "#e6edf3",
  },
  titleAccent: {
    background: "linear-gradient(135deg, #39d353 0%, #58a6ff 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  subtitle: {
    fontSize: "1.05rem",
    color: "#8b949e",
    maxWidth: 600,
    lineHeight: 1.7,
  },
  featureGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 16,
    width: "100%",
    marginTop: 8,
  },
  featureCard: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    padding: "16px 20px",
    background: "rgba(22, 27, 34, 0.8)",
    border: "1px solid #21262d",
    borderRadius: 10,
    textAlign: "left",
    backdropFilter: "blur(8px)",
  },
  featureIcon: { fontSize: "1.4rem", flexShrink: 0, marginTop: 2 },
  featureLabel: {
    fontWeight: 700,
    fontSize: "0.9rem",
    marginBottom: 4,
    color: "#e6edf3",
  },
  featureDesc: { fontSize: "0.78rem", color: "#8b949e", lineHeight: 1.5 },
};
