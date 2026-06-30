import React, { useState, useCallback, useRef, useEffect } from "react";
import Hero from "./components/Hero.jsx";
import Generator from "./components/Generator.jsx";
import Footer from "./components/Footer.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8787";

export default function App() {
  const [phase, setPhase] = useState("idle");          // idle | running | done | error
  const [logs, setLogs] = useState([]);
  const [readme, setReadme] = useState("");
  const [stats, setStats] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(null);

  const generate = useCallback(async (username, force = false) => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase("running");
    setLogs([]);
    setReadme("");
    setStats(null);
    setErrorMsg("");

    try {
      const resp = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, force }),
        signal: ctrl.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Server error ${resp.status}: ${text}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.type === "progress") {
            setLogs(prev => [...prev, event]);
          } else if (event.type === "done") {
            setReadme(event.readme);
            setStats(event.stats);
            setPhase("done");
          } else if (event.type === "error") {
            setErrorMsg(event.message);
            setPhase("error");
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setErrorMsg(err.message || "Unknown error");
      setPhase("error");
    }
  }, []);

  const reset = () => {
    if (abortRef.current) abortRef.current.abort();
    setPhase("idle");
    setLogs([]);
    setReadme("");
    setStats(null);
    setErrorMsg("");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Hero />
      <Generator
        phase={phase}
        logs={logs}
        readme={readme}
        stats={stats}
        errorMsg={errorMsg}
        onGenerate={generate}
        onReset={reset}
      />
      <Footer />
    </div>
  );
}
