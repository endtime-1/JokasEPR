"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Bot,
  ChevronRight,
  LoaderCircle,
  MessageSquare,
  Plus,
  Send,
  Trash2
} from "lucide-react";
import { AppShell } from "../../components/app-shell";
import { apiFetch, ApiEnvelope } from "../../lib/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type Session = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
};

type ChatResponse = {
  sessionId: string;
  model: string;
  reply: string;
  disclaimer: string;
};

type AiModel = {
  id: string;
  label: string;
  isDefault: boolean;
};

type SessionDetail = {
  session: Session;
  messages: Message[];
};

const EXAMPLE_QUESTIONS = [
  "Why did egg production drop this week?",
  "Which farm has the highest mortality?",
  "Which flock is performing poorly?",
  "How much feed will be needed next week?",
  "Which product is most profitable this month?",
  "Which customer owes the most money?",
  "Which raw material is close to running out?",
  "Which feed formula is most expensive?",
  "Which soya batch had the best oil yield?",
  "Which customer has stopped buying?",
  "What should management focus on this week?"
];

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const lines = message.content.split("\n");

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold shadow-sm ${
          isUser
            ? "bg-gradient-to-br from-brand to-[#dd741b] text-white"
            : "border border-line bg-white text-ink/70"
        }`}
      >
        {isUser ? "You" : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={`max-w-[76%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-card ${
          isUser
            ? "rounded-tr-sm bg-gradient-to-br from-brand to-[#dd741b] text-white"
            : "rounded-tl-sm border border-line bg-white text-ink"
        }`}
      >
        {lines.map((line, i) => (
          <span key={i}>
            {line}
            {i < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AiAssistantPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    apiFetch<ApiEnvelope<Session[]>>("/ai/sessions")
      .then((res) => setSessions(res.data ?? []))
      .catch(() => undefined);
    apiFetch<ApiEnvelope<AiModel[]>>("/ai/models")
      .then((res) => {
        const list = res.data ?? [];
        setModels(list);
        setSelectedModel(list.find((m) => m.isDefault)?.id ?? list[0]?.id ?? "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadSession(id: string) {
    setLoadingSession(true);
    setError("");
    try {
      const res = await apiFetch<ApiEnvelope<SessionDetail>>(`/ai/sessions/${id}`);
      setActiveSessionId(id);
      setMessages((res.data?.messages ?? []) as Message[]);
    } catch {
      setError("Failed to load session.");
    } finally {
      setLoadingSession(false);
    }
  }

  async function newSession() {
    setActiveSessionId(null);
    setMessages([]);
    setError("");
    setInput("");
    textareaRef.current?.focus();
  }

  async function deleteSession(id: string) {
    try {
      await apiFetch(`/ai/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch {
      setError("Failed to delete session.");
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    setInput("");
    setError("");
    setLoading(true);

    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString()
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await apiFetch<ApiEnvelope<ChatResponse>>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: text,
          sessionId: activeSessionId ?? undefined,
          model: selectedModel || undefined
        })
      });

      const aiMsg: Message = {
        id: `tmp-ai-${Date.now()}`,
        role: "assistant",
        content: res.data.reply,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, aiMsg]);
      setActiveSessionId(res.data.sessionId);

      apiFetch<ApiEnvelope<Session[]>>("/ai/sessions")
        .then((r) => setSessions(r.data ?? []))
        .catch(() => undefined);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Failed to get a response.";
      let displayMsg = raw;
      try {
        const parsed = JSON.parse(raw) as { message?: unknown };
        const m = parsed.message;
        if (typeof m === "string") displayMsg = m;
        else if (Array.isArray(m) && m.length > 0) displayMsg = String(m[0]);
      } catch {
        // raw is already a plain string
      }
      setError(displayMsg);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  const isEmpty = messages.length === 0 && !loadingSession;

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-5.5rem)] gap-4 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-panel lg:flex">

          {/* Sidebar header */}
          <div className="bg-gradient-to-br from-ink to-[#2d3f4f] px-4 py-5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">
                <Bot className="h-4 w-4 text-white" />
              </span>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                  AI Assistant
                </p>
                <p className="text-sm font-bold text-white leading-tight">Conversations</p>
              </div>
            </div>
            <button
              onClick={newSession}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#dd741b] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              New conversation
            </button>
          </div>

          {/* Session list */}
          <div className="flex-1 overflow-y-auto p-2">
            {sessions.length === 0 && (
              <div className="flex flex-col items-center py-8 text-center">
                <MessageSquare className="mb-2 h-6 w-6 text-ink/20" />
                <p className="text-xs text-ink/40">No conversations yet</p>
              </div>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 transition ${
                  activeSessionId === s.id
                    ? "bg-brand/10 text-brand"
                    : "text-ink hover:bg-field"
                }`}
                onClick={() => void loadSession(s.id)}
              >
                <MessageSquare
                  className={`h-3.5 w-3.5 shrink-0 ${
                    activeSessionId === s.id ? "text-brand" : "text-ink/35"
                  }`}
                />
                <span className="flex-1 truncate text-sm font-medium">
                  {s.title ?? "Untitled"}
                </span>
                <span className="shrink-0 rounded-md bg-line/60 px-1.5 py-0.5 text-[10px] font-semibold text-ink/50">
                  {s._count.messages}
                </span>
                <button
                  className="hidden shrink-0 text-ink/30 transition hover:text-red-500 group-hover:block"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deleteSession(s.id);
                  }}
                  aria-label="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main chat ────────────────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-panel">

          {/* Chat header */}
          <div className="flex items-center gap-3 border-b border-line bg-gradient-to-r from-white to-field/60 px-5 py-3.5">
            <div className="relative">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand/20 to-brand/10">
                <Bot className="h-5 w-5 text-brand" />
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-ink">AKOKO SOLUTIONS AI Assistant</h2>
              <p className="text-xs text-ink/45">Business intelligence · powered by live company data</p>
            </div>
            {models.length > 0 && (
              <select
                className="min-h-9 max-w-[220px] rounded-lg border border-line bg-white px-3 text-xs font-medium text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                aria-label="AI model"
                disabled={loading}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-5 px-5 py-6">
            {loadingSession && (
              <div className="flex justify-center py-12">
                <LoaderCircle className="h-5 w-5 animate-spin text-brand" />
              </div>
            )}

            {isEmpty && !loadingSession && (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-brand/20 to-brand/10 shadow-sm">
                  <Bot className="h-8 w-8 text-brand" />
                </div>
                <h3 className="mb-1.5 text-lg font-extrabold tracking-tight text-ink">
                  Ask a business question
                </h3>
                <p className="mb-7 max-w-sm text-sm text-ink/50 leading-relaxed">
                  I answer questions using live company data — poultry, feed, soya, sales,
                  inventory, finance, and more.
                </p>
                <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                  {EXAMPLE_QUESTIONS.slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => void sendMessage(q)}
                      className="flex items-center gap-2 rounded-xl border border-line bg-field/60 px-3 py-2.5 text-left text-xs font-medium text-ink/70 transition hover:border-brand/40 hover:bg-white hover:text-ink hover:shadow-card"
                    >
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-brand" />
                      <span className="leading-snug">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-white shadow-sm">
                  <Bot className="h-4 w-4 text-ink/50" />
                </div>
                <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-line bg-white px-4 py-3 shadow-card">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink/30 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink/30 [animation-delay:140ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink/30 [animation-delay:280ms]" />
                </div>
              </div>
            )}

            {error && (
              <div className="app-alert-warning text-xs">{error}</div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Disclaimer */}
          <div className="border-t border-line px-5 py-2 text-[11px] text-ink/40">
            <span className="font-semibold text-amber-600">Advisory only.</span>
            {" "}AI insights should be validated with your operational teams before decisions are made.
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="border-t border-line px-4 py-3">
            <div className="flex items-end gap-2 rounded-xl border border-line bg-field/60 px-3 py-2 transition focus-within:border-brand focus-within:bg-white focus-within:ring-4 focus-within:ring-brand/10">
              <textarea
                ref={textareaRef}
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink/35"
                placeholder="Ask about poultry, sales, inventory, finance… (Enter to send)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={loading}
                style={{ maxHeight: "120px", overflowY: "auto" }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand text-white shadow-sm transition hover:bg-[#dd741b] active:scale-95 disabled:opacity-40"
                aria-label="Send message"
              >
                {loading ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
