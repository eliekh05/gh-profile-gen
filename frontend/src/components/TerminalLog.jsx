import React, { useEffect, useRef } from "react";

const STEP_ICONS = {
  profile:       "👤",
  repos:         "📦",
  repos_found:   "📊",
  clone:         "🔬",
  aggregating:   "🧮",
  building:      "✍️",
  cache:         "⚡",
};

const STEP_COLORS = {
  profile:       "#58a6ff",
  repos:         "#58a6ff",
  repos_found:   "#e3b341",
  clone:         "#39d353",
  aggregating:   "#f78166",
  building:      "#a371f7",
  cache:         "#39d353",
};

export default function TerminalLog({ logs, running }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Build progress info from clone events
  const cloneEvents = logs.filter(l => l.step === "clone");
  const total = cloneEvents[cloneEvents.length - 1]?.total ?? 0;
  const current = cloneEvents[cloneEvents.length - 1]?.index ?? 0;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div style={styles.wrap}>
      {/* Header bar */}
      <div style={styles.header}>
        <div style={styles.dots}>
          <span style={{ ...styles.dot, background: "#ff5f57" }} />
          <span style={{ ...styles.dot, background: "#febc2e" }} />
          <span style={{ ...styles.dot, background: "#28c840" }} />
        </div>
        <span style={styles.title}>analysis log</span>
        {running && <span style={styles.live}>● LIVE</span>}
        {!running && <span style={styles.done}>✓ DONE</span>}
      </div>

      {/* Progress bar (only during clone phase) */}
      {total > 0 && (
        <div style={styles.progressOuter}>
          <div style={{ ...styles.progressInner, width: `${pct}%` }} />
          <span style={styles.progressLabel}>{current}/{total} repos · {pct}%</span>
        </div>
      )}

      {/* Log lines */}
      <div style={styles.body}>
        {logs.map((log, i) => (
          <LogLine key={i} log={log} isLast={i === logs.length - 1 && running} />
        ))}
        {running && (
          <div style={styles.cursor}>
            <span style={styles.cursorPrompt}>$</span>
            <span style={styles.cursorBlink}>▋</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function LogLine({ log, isLast }) {
  const icon  = STEP_ICONS[log.step]  || "→";
  const color = STEP_COLORS[log.step] || "#8b949e";
  const ts    = new Date().toLocaleTimeString("en-US", { hour12: false });

  return (
    <div style={{
      ...styles.line,
      animation: "slideIn 0.15s ease both",
    }}>
      <span style={styles.ts}>{ts}</span>
      <span style={{ fontSize: "0.85rem", minWidth: 20 }}>{icon}</span>
      {log.step === "clone" && log.index && log.total ? (
        <span style={styles.msg}>
          <span style={{ color: "#8b949e" }}>[</span>
          <span style={{ color }}>{String(log.index).padStart(2, "0")}</span>
          <span style={{ color: "#8b949e" }}>/{log.total}]</span>
          {" "}
          <span style={{ color: "#e6edf3" }}>{log.repo}</span>
        </span>
      ) : (
        <span style={{ ...styles.msg, color }}>{log.message}</span>
      )}
      {isLast && <span style={styles.activeDot} />}
    </div>
  );
}

const styles = {
  wrap: {
    background: "#0d1117",
    border: "1px solid #21262d",
    borderRadius: 10,
    overflow: "hidden",
    fontFamily: "var(--font-mono)",
    animation: "fadeIn 0.3s ease both",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "#161b22",
    borderBottom: "1px solid #21262d",
  },
  dots: { display: "flex", gap: 6 },
  dot: {
    width: 12, height: 12,
    borderRadius: "50%",
    display: "inline-block",
  },
  title: {
    flex: 1,
    fontSize: "0.75rem",
    color: "#8b949e",
    letterSpacing: "0.05em",
  },
  live: {
    fontSize: "0.7rem",
    color: "#39d353",
    fontWeight: 700,
    animation: "pulse 1.5s infinite",
  },
  done: {
    fontSize: "0.7rem",
    color: "#39d353",
    fontWeight: 700,
  },
  progressOuter: {
    position: "relative",
    height: 4,
    background: "#21262d",
    overflow: "hidden",
  },
  progressInner: {
    height: "100%",
    background: "linear-gradient(90deg, #39d353, #58a6ff)",
    transition: "width 0.3s ease",
  },
  progressLabel: {
    position: "absolute",
    right: 8,
    top: 6,
    fontSize: "0.65rem",
    color: "#8b949e",
  },
  body: {
    padding: "12px 14px",
    maxHeight: 320,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  line: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: "0.78rem",
    lineHeight: 1.5,
  },
  ts: {
    color: "#30363d",
    fontSize: "0.68rem",
    flexShrink: 0,
    minWidth: 72,
  },
  msg: {
    color: "#8b949e",
    wordBreak: "break-all",
  },
  activeDot: {
    display: "inline-block",
    width: 6, height: 6,
    borderRadius: "50%",
    background: "#39d353",
    animation: "pulse 1s infinite",
    flexShrink: 0,
  },
  cursor: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    fontSize: "0.78rem",
  },
  cursorPrompt: { color: "#39d353" },
  cursorBlink: {
    color: "#39d353",
    animation: "blink 1s step-end infinite",
  },
};
