import React, { useRef, useEffect, useState } from "react";
import TerminalLog from "./TerminalLog.jsx";
import ReadmeOutput from "./ReadmeOutput.jsx";

export default function Generator({ phase, logs, readme, stats, errorMsg, onGenerate, onReset }) {
  const [username, setUsername] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (phase === "idle" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const u = username.trim();
    if (!u) return;
    onGenerate(u);
  };

  return (
    <main style={styles.main}>
      <div style={styles.inner}>

        {/* ── Input form ─────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputWrap}>
            <span style={styles.ghIcon}>
              <svg height="20" viewBox="0 0 16 16" width="20" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
              </svg>
            </span>
            <input
              ref={inputRef}
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter GitHub username…"
              disabled={phase === "running"}
              style={styles.input}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
            />
            {(phase === "done" || phase === "error") && (
              <button type="button" onClick={onReset} style={styles.resetBtn}>
                ↺ New
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={phase === "running" || !username.trim()}
            style={{
              ...styles.generateBtn,
              ...(phase === "running" ? styles.generateBtnDisabled : {}),
            }}
          >
            {phase === "running" ? (
              <>
                <Spinner />
                Analyzing…
              </>
            ) : (
              <>
                🧬 Generate README
              </>
            )}
          </button>
        </form>

        {/* ── Hint ──────────────────────────────────────────────────── */}
        {phase === "idle" && (
          <p style={styles.hint}>
            Works on any public GitHub user — try{" "}
            {["torvalds", "gaearon", "sindresorhus", "antirez"].map((u, i, a) => (
              <React.Fragment key={u}>
                <button style={styles.exampleBtn} onClick={() => { setUsername(u); }}>
                  {u}
                </button>
                {i < a.length - 1 ? ", " : ""}
              </React.Fragment>
            ))}
          </p>
        )}

        {/* ── Error ─────────────────────────────────────────────────── */}
        {phase === "error" && (
          <div style={styles.errorBox}>
            <span style={{ color: "#f78166" }}>✖</span>{" "}
            {errorMsg}
          </div>
        )}

        {/* ── Terminal log ──────────────────────────────────────────── */}
        {(phase === "running" || phase === "done") && logs.length > 0 && (
          <TerminalLog logs={logs} running={phase === "running"} />
        )}

        {/* ── Stats summary ─────────────────────────────────────────── */}
        {phase === "done" && stats && (
          <div style={styles.statsRow}>
            <StatPill label="Repos analyzed" value={stats.repos_analyzed} color="#39d353" />
            <StatPill label="Total stars"    value={stats.total_stars}    color="#e3b341" />
            <StatPill label="Languages"      value={stats.languages?.length ?? 0}   color="#58a6ff" />
            <StatPill label="Frameworks"     value={stats.frameworks?.length ?? 0}  color="#f78166" />
          </div>
        )}

        {/* ── README output ─────────────────────────────────────────── */}
        {phase === "done" && readme && (
          <ReadmeOutput readme={readme} />
        )}
      </div>
    </main>
  );
}

function StatPill({ label, value, color }) {
  return (
    <div style={styles.statPill}>
      <span style={{ ...styles.statValue, color }}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <span style={{
      display: "inline-block",
      width: 14, height: 14,
      border: "2px solid rgba(255,255,255,0.3)",
      borderTopColor: "#fff",
      borderRadius: "50%",
      animation: "rotate 0.7s linear infinite",
      marginRight: 8,
    }} />
  );
}

const styles = {
  main: {
    flex: 1,
    padding: "40px 24px 60px",
    background: "var(--bg)",
  },
  inner: {
    maxWidth: 900,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  form: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  inputWrap: {
    flex: 1,
    minWidth: 260,
    display: "flex",
    alignItems: "center",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    padding: "0 16px",
    gap: 10,
    transition: "border-color 0.2s",
  },
  ghIcon: {
    color: "var(--muted)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
  },
  input: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: "1rem",
    padding: "14px 0",
  },
  resetBtn: {
    background: "none",
    border: "none",
    color: "var(--muted)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "0.8rem",
    padding: "4px 8px",
    borderRadius: 4,
    transition: "color 0.2s",
  },
  generateBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 28px",
    background: "var(--accent)",
    color: "#000",
    border: "none",
    borderRadius: "var(--radius)",
    fontFamily: "var(--font-sans)",
    fontWeight: 700,
    fontSize: "0.95rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "opacity 0.2s, transform 0.15s",
  },
  generateBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
    transform: "none",
  },
  hint: {
    fontSize: "0.82rem",
    color: "var(--muted)",
    fontFamily: "var(--font-mono)",
  },
  exampleBtn: {
    background: "none",
    border: "none",
    color: "var(--accent2)",
    cursor: "pointer",
    fontFamily: "var(--font-mono)",
    fontSize: "0.82rem",
    textDecoration: "underline",
    padding: 0,
  },
  errorBox: {
    padding: "14px 18px",
    background: "rgba(247, 129, 102, 0.08)",
    border: "1px solid rgba(247, 129, 102, 0.25)",
    borderRadius: "var(--radius)",
    color: "#f78166",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statsRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    animation: "fadeIn 0.4s ease both",
  },
  statPill: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 20px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    minWidth: 100,
    flex: 1,
  },
  statValue: {
    fontSize: "1.5rem",
    fontWeight: 800,
    fontFamily: "var(--font-sans)",
    lineHeight: 1,
  },
  statLabel: {
    fontSize: "0.72rem",
    color: "var(--muted)",
    marginTop: 4,
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
};
