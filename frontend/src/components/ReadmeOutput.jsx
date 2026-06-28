import React, { useState, useRef, useEffect } from "react";

export default function ReadmeOutput({ readme }) {
  const [tab, setTab]         = useState("raw");   // raw | preview
  const [copied, setCopied]   = useState(false);
  const textareaRef           = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (tab === "raw" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [tab, readme]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(readme);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      if (textareaRef.current) {
        textareaRef.current.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const download = () => {
    const blob = new Blob([readme], { type: "text/markdown;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "README.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Simple markdown → HTML preview (titles, badges, code blocks, tables)
  const previewHtml = mdToHtml(readme);

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.tabs}>
          <TabBtn active={tab === "raw"}     onClick={() => setTab("raw")}>
            📄 Raw Markdown
          </TabBtn>
          <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>
            👁 Preview
          </TabBtn>
        </div>
        <div style={styles.actions}>
          <ActionBtn onClick={copy} accent={copied ? "#39d353" : undefined}>
            {copied ? "✓ Copied!" : "📋 Copy"}
          </ActionBtn>
          <ActionBtn onClick={download}>
            ⬇ Download README.md
          </ActionBtn>
        </div>
      </div>

      {/* Instruction banner */}
      <div style={styles.banner}>
        <span style={styles.bannerIcon}>💡</span>
        <span>
          Create a repo named <code style={styles.code}>&lt;your-username&gt;/&lt;your-username&gt;</code> on GitHub,
          paste this as <code style={styles.code}>README.md</code>, and commit — it will appear on your profile.
        </span>
      </div>

      {/* Content */}
      {tab === "raw" ? (
        <div style={styles.rawWrap}>
          <textarea
            ref={textareaRef}
            value={readme}
            readOnly
            style={styles.textarea}
            onClick={e => e.target.select()}
          />
        </div>
      ) : (
        <div
          style={styles.preview}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      {/* Line count */}
      <div style={styles.footer}>
        <span style={styles.footerText}>
          {readme.split("\n").length} lines · {(new Blob([readme]).size / 1024).toFixed(1)} KB
        </span>
        <span style={styles.footerText}>
          Click the textarea to select all
        </span>
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "rgba(57,211,83,0.12)" : "transparent",
      border:     active ? "1px solid rgba(57,211,83,0.3)" : "1px solid transparent",
      color:      active ? "#39d353" : "#8b949e",
      padding: "6px 16px",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "var(--font-sans)",
      fontWeight: active ? 600 : 400,
      fontSize: "0.82rem",
      transition: "all 0.15s",
    }}>
      {children}
    </button>
  );
}

function ActionBtn({ onClick, accent, children }) {
  return (
    <button onClick={onClick} style={{
      background: accent ? `${accent}22` : "var(--surface2)",
      border: `1px solid ${accent || "var(--border)"}`,
      color: accent || "var(--text)",
      padding: "7px 16px",
      borderRadius: 6,
      cursor: "pointer",
      fontFamily: "var(--font-sans)",
      fontWeight: 600,
      fontSize: "0.82rem",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }}>
      {children}
    </button>
  );
}

// ── Minimal markdown renderer ─────────────────────────────────────────────────
function mdToHtml(md) {
  let html = md
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

    // Fenced code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, (_, c) =>
      `<pre style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px;overflow-x:auto;margin:10px 0;font-size:0.8rem;color:#e6edf3;font-family:monospace">${c}</pre>`)

    // Inline code
    .replace(/`([^`]+)`/g, '<code style="background:#161b22;padding:2px 6px;border-radius:4px;font-size:0.85em;color:#79c0ff;font-family:monospace">$1</code>')

    // H1
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.8rem;font-weight:800;margin:18px 0 10px;color:#e6edf3;border-bottom:1px solid #21262d;padding-bottom:8px">$1</h1>')
    // H2
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.3rem;font-weight:700;margin:16px 0 8px;color:#e6edf3;border-bottom:1px solid #21262d;padding-bottom:6px">$1</h2>')
    // H3
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1.05rem;font-weight:700;margin:14px 0 6px;color:#e6edf3">$1</h3>')

    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e6edf3">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em style="color:#8b949e">$1</em>')

    // Images (inline — shields / stat cards)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img alt="$1" src="$2" style="max-width:100%;height:auto;margin:2px 3px;vertical-align:middle;border-radius:4px" />')

    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color:#58a6ff;text-decoration:none" target="_blank" rel="noopener">$1</a>')

    // HR
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #21262d;margin:16px 0"/>')

    // Tables
    .replace(/(\|[^\n]+\|\n)((?:\|[-:]+[-| :]*\|\n))((?:\|[^\n]+\|\n?)+)/g, (m, header, sep, body) => {
      const hCells = header.split("|").filter(c => c.trim()).map(c =>
        `<th style="padding:6px 12px;border:1px solid #21262d;text-align:left;color:#e6edf3;background:#161b22">${c.trim()}</th>`
      );
      const rows = body.trim().split("\n").map(row => {
        const cells = row.split("|").filter(c => c.trim()).map(c =>
          `<td style="padding:6px 12px;border:1px solid #21262d;color:#8b949e">${c.trim()}</td>`
        );
        return `<tr>${cells.join("")}</tr>`;
      });
      return `<table style="border-collapse:collapse;width:100%;margin:10px 0;font-size:0.85rem">
        <thead><tr>${hCells.join("")}</tr></thead>
        <tbody>${rows.join("")}</tbody>
      </table>`;
    })

    // Unordered lists
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;color:#8b949e;padding-left:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul style="list-style:none;padding:0 0 0 16px;margin:6px 0">${m}</ul>`)

    // Blockquotes (align tags used for centering)
    .replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #39d353;padding:4px 12px;margin:8px 0;color:#8b949e">$1</blockquote>')

    // Paragraphs (double newlines → p)
    .replace(/\n{2,}/g, "</p><p style='margin:8px 0;color:#8b949e;font-size:0.9rem'>")

    // Restore GitHub stat card HTML tags that we escaped
    .replace(/&lt;p align="([^"]+)"&gt;/g, '<p style="text-align:$1">')
    .replace(/&lt;\/p&gt;/g, "</p>")
    .replace(/&lt;h1 align="([^"]+)"&gt;/g, '<h1 style="text-align:$1;font-size:1.8rem;font-weight:800;margin:18px 0 10px;color:#e6edf3">')
    .replace(/&lt;h3 align="([^"]+)"&gt;/g, '<h3 style="text-align:$1;font-size:1.05rem;font-weight:700;margin:14px 0 6px;color:#e6edf3">')
    .replace(/&lt;\/(h1|h2|h3|h4|h5|h6)&gt;/g, "</$1>")
    .replace(/&lt;img ([^&]+)\/&gt;/g, (_, attrs) => {
      // decode common attrs
      const decoded = attrs
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"');
      return `<img ${decoded} style="max-width:100%;height:auto;margin:4px;vertical-align:middle;border-radius:4px"/>`;
    })
    .replace(/&lt;a href="([^"]+)"&gt;/g, '<a href="$1" target="_blank" rel="noopener" style="color:#58a6ff">')
    .replace(/&lt;\/a&gt;/g, "</a>")
    .replace(/&lt;em&gt;/g, "<em>").replace(/&lt;\/em&gt;/g, "</em>")
    .replace(/&lt;i&gt;/g, "<em style='color:#8b949e'>").replace(/&lt;\/i&gt;/g, "</em>")
    .replace(/&lt;strong&gt;/g, "<strong>").replace(/&lt;\/strong&gt;/g, "</strong>");

  return `<p style="margin:8px 0;color:#8b949e;font-size:0.9rem">${html}</p>`;
}

const styles = {
  wrap: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    overflow: "hidden",
    animation: "fadeIn 0.4s ease both",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 10,
    padding: "12px 16px",
    background: "var(--surface2)",
    borderBottom: "1px solid var(--border)",
  },
  tabs: { display: "flex", gap: 6 },
  actions: { display: "flex", gap: 8, flexWrap: "wrap" },
  banner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "12px 16px",
    background: "rgba(88, 166, 255, 0.06)",
    borderBottom: "1px solid rgba(88, 166, 255, 0.15)",
    fontSize: "0.82rem",
    color: "#8b949e",
    lineHeight: 1.5,
  },
  bannerIcon: { fontSize: "1rem", flexShrink: 0, marginTop: 1 },
  code: {
    fontFamily: "var(--font-mono)",
    background: "#161b22",
    padding: "1px 5px",
    borderRadius: 4,
    fontSize: "0.8em",
    color: "#79c0ff",
  },
  rawWrap: {
    padding: "16px",
    background: "#0d1117",
  },
  textarea: {
    width: "100%",
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#e6edf3",
    fontFamily: "var(--font-mono)",
    fontSize: "0.78rem",
    lineHeight: 1.6,
    resize: "none",
    minHeight: 400,
    overflow: "hidden",
    cursor: "text",
  },
  preview: {
    padding: "20px 24px",
    background: "#0d1117",
    minHeight: 400,
    maxHeight: 700,
    overflowY: "auto",
    lineHeight: 1.6,
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: "var(--surface2)",
    borderTop: "1px solid var(--border)",
  },
  footerText: {
    fontSize: "0.7rem",
    color: "#484f58",
    fontFamily: "var(--font-mono)",
  },
};
