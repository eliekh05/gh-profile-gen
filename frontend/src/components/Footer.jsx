import React from "react";

export default function Footer() {
  return (
    <footer style={styles.footer}>
      <div style={styles.inner}>
        <div style={styles.left}>
          <span style={styles.brand}>🧬 gh-profile-gen</span>
          <span style={styles.sep}>·</span>
          <span style={styles.tagline}>Evidence-driven. No hardcodes. All repos.</span>
        </div>
        <div style={styles.links}>
          <a
            href="https://github.com/eliekh05/gh-profile-gen"
            style={styles.link}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub ↗
            <span>Powered by</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "4px",
              color: "var(--text2)",
            }}>
              <svg width="14" height="14" viewBox="0 0 100 100" fill="none">
                <path d="M0 50 L50 0 L100 50 L50 100 Z" fill="#f6821f"/>
              </svg>
              Cloudflare Workers
            </span>
            <span>·</span>
            <a
              href="https://gh-repo-gen.pages.dev"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--text2)", textDecoration: "none" }}
              onMouseEnter={e => e.target.style.color = "var(--brand)"}
              onMouseLeave={e => e.target.style.color = "var(--text2)"}
            >
              Per Readme Generator ↗
          </a>
        </div>
      </div>
    </footer>
  );
}

const styles = {
  footer: {
    borderTop: "1px solid #21262d",
    padding: "20px 24px",
    background: "#080c10",
  },
  inner: {
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  brand: {
    fontFamily: "var(--font-mono)",
    fontWeight: 700,
    fontSize: "0.85rem",
    color: "#39d353",
  },
  sep: { color: "#30363d" },
  tagline: {
    fontSize: "0.78rem",
    color: "#484f58",
    fontFamily: "var(--font-mono)",
  },
  links: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: "0.78rem",
    color: "#484f58",
    fontFamily: "var(--font-mono)",
  },
  link: {
    color: "#58a6ff",
    textDecoration: "none",
  },
  note: { color: "#484f58" },
};
