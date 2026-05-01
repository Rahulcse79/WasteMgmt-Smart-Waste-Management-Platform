"use client";
import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_REPLIES = [
  "Show bin status",
  "Overflow alerts today",
  "Optimise pickup route",
  "Download report",
];

/* ── Bot / X icon SVGs (inline to avoid import overhead) ── */
function BotIcon(): React.ReactElement {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2M20 14h2M9 18v2M15 18v2" />
    </svg>
  );
}
function XIcon(): React.ReactElement {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
function SendIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" />
    </svg>
  );
}

/* ── Message bubble ── */
function Bubble({ msg }: { msg: Message }): React.ReactElement {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-2`}>
      <div
        className="max-w-[80%] px-3 py-2 rounded-2xl text-sm font-dm-sans leading-relaxed"
        style={
          isUser
            ? {
                background: "linear-gradient(135deg, #00C9A7, #6C63FF)",
                color: "#fff",
                borderBottomRightRadius: 4,
              }
            : {
                background: "var(--surface-strong)",
                border: "1px solid var(--border)",
                color: "var(--color-text-primary)",
                borderBottomLeftRadius: 4,
              }
        }
      >
        {msg.content}
      </div>
    </div>
  );
}

export function Chatbot(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hi! I'm Coral AI. Ask me anything about bin levels, routes, alerts, or reports." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const send = async (text: string) => {
    const userMsg = text.trim();
    if (!userMsg || loading) return;
    setInput("");

    const next: Message[] = [...messages, { role: "user", content: userMsg }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const data = (await res.json()) as { content?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content ?? data.error ?? "Sorry, something went wrong." },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999 }}
      aria-label="Coral AI assistant"
    >
      {/* ── Chat panel ── */}
      <div
        className="chatbot-panel"
        data-open={open ? "true" : "false"}
        style={{
          position: "absolute",
          bottom: 68,
          right: 0,
          width: 380,
          maxWidth: "calc(100vw - 48px)",
          height: 520,
          maxHeight: "calc(100vh - 100px)",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface-strong)",
          border: "1px solid var(--border-strong)",
          borderRadius: 20,
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,201,167,0.15)",
          overflow: "hidden",
        }}
        role="dialog"
        aria-label="Coral AI chat"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: "1px solid var(--border)", flexShrink: 0 }}
        >
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center text-white"
              style={{ background: "var(--accent-coral)" }}
            >
              <BotIcon />
            </div>
            <div>
              <div className="font-syne font-bold text-sm" style={{ color: "var(--color-text-primary)" }}>
                Coral AI
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-dm-sans" style={{ color: "var(--fg-muted)" }}>
                <span className="live-dot" style={{ width: 6, height: 6 }} />
                Waste Ops Assistant
              </div>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="btn btn-ghost btn-sm"
            aria-label="Close chat"
          >
            <XIcon />
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-3 py-3"
          style={{ overscrollBehavior: "contain" }}
        >
          {messages.map((m, i) => (
            <Bubble key={i} msg={m} />
          ))}
          {loading && (
            <div className="flex justify-start mb-2">
              <div
                className="px-3 py-2 rounded-2xl text-sm"
                style={{
                  background: "var(--surface-strong)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                  borderBottomLeftRadius: 4,
                }}
              >
                <span className="inline-flex gap-1">
                  <span className="skeleton" style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block" }} />
                  <span className="skeleton" style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", animationDelay: "0.2s" }} />
                  <span className="skeleton" style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", animationDelay: "0.4s" }} />
                </span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Quick replies */}
        <div
          className="px-3 pb-2 flex flex-wrap gap-1.5"
          style={{ flexShrink: 0, borderTop: "1px solid var(--border)", paddingTop: 8 }}
        >
          {QUICK_REPLIES.map((r) => (
            <button
              key={r}
              onClick={() => void send(r)}
              disabled={loading}
              className="chip font-dm-sans hover:bg-white/5 transition-colors cursor-pointer"
              style={{
                color: "#00C9A7",
                border: "1px solid rgba(0,201,167,0.35)",
                background: "rgba(0,201,167,0.06)",
                fontSize: "0.7rem",
              }}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Input */}
        <div
          className="flex items-center gap-2 px-3 pb-3 pt-2"
          style={{ flexShrink: 0 }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask about bins, routes, alerts…"
            className="input flex-1 text-sm font-dm-sans"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void send(input); } }}
            disabled={loading}
            aria-label="Chat input"
          />
          <button
            onClick={() => void send(input)}
            disabled={loading || !input.trim()}
            className="btn btn-coral h-9 w-9 p-0 flex items-center justify-center shrink-0"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </div>

      {/* ── FAB button ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center text-white font-bold"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "var(--accent-coral)",
          boxShadow: "0 8px 24px rgba(0,201,167,0.45)",
          border: "none",
          cursor: "pointer",
          transition: "transform .15s ease, box-shadow .15s ease",
        }}
        aria-label={open ? "Close Coral AI" : "Open Coral AI assistant"}
        aria-expanded={open}
      >
        {/* Pulsing ring */}
        {!open && <span className="fab-ring" aria-hidden />}
        <span style={{ transition: "transform .2s ease", transform: open ? "rotate(90deg) scale(0.9)" : "none" }}>
          {open ? <XIcon /> : <BotIcon />}
        </span>
      </button>
    </div>
  );
}
