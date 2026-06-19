"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, ChevronRight, Loader2, MessageSquare, Plus, Send, Trash2 } from "lucide-react";
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
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${isUser ? "bg-brand text-white" : "bg-field border border-line text-ink"}`}>
        {isUser ? "You" : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${isUser ? "bg-brand text-white rounded-tr-none" : "bg-white border border-line text-ink rounded-tl-none shadow-panel"}`}>
        {message.content.split("\n").map((line, i) => (
          <span key={i}>{line}{i < message.content.split("\n").length - 1 ? <br /> : null}</span>
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

  useEffect(() => {
    apiFetch<ApiEnvelope<Session[]>>("/ai/sessions")
      .then((res) => setSessions(res.data))
      .catch(() => undefined);
    apiFetch<ApiEnvelope<AiModel[]>>("/ai/models")
      .then((res) => {
        setModels(res.data);
        setSelectedModel(res.data.find((model) => model.isDefault)?.id ?? res.data[0]?.id ?? "");
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
      setMessages(res.data.messages as Message[]);
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
        body: JSON.stringify({ message: text, sessionId: activeSessionId ?? undefined, model: selectedModel || undefined })
      });

      const aiMsg: Message = {
        id: `tmp-ai-${Date.now()}`,
        role: "assistant",
        content: res.data.reply,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, aiMsg]);
      setActiveSessionId(res.data.sessionId);

      // Refresh sessions list
      apiFetch<ApiEnvelope<Session[]>>("/ai/sessions")
        .then((r) => setSessions(r.data))
        .catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to get a response.";
      try {
        const parsed = JSON.parse(msg) as { message?: string };
        setError(parsed.message ?? msg);
      } catch {
        setError(msg);
      }
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void sendMessage(input);
  }

  const isEmpty = messages.length === 0 && !loadingSession;

  return (
    <AppShell>
      <div className="flex h-[calc(100vh-3rem)] gap-4 overflow-hidden">

        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col lg:flex">
          <button
            onClick={newSession}
            className="mb-3 flex min-h-10 items-center gap-2 rounded-md bg-brand px-3 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> New conversation
          </button>
          <div className="flex-1 overflow-y-auto space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer ${activeSessionId === s.id ? "bg-brand/10 text-brand font-medium" : "hover:bg-field text-ink"}`}
                onClick={() => void loadSession(s.id)}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{s.title ?? "Untitled"}</span>
                <button
                  className="hidden group-hover:block text-ink/40 hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); void deleteSession(s.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="px-3 py-2 text-xs text-ink/50">No conversations yet</p>
            )}
          </div>
        </aside>

        {/* Main chat */}
        <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-line bg-white shadow-panel">

          {/* Header */}
          <div className="flex items-center gap-3 border-b border-line px-5 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10">
              <Bot className="h-5 w-5 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Jokas AI Assistant</h2>
              <p className="text-xs text-ink/50">Business intelligence powered by company data</p>
            </div>
            {models.length > 0 && (
              <select
                className="min-h-9 max-w-[260px] rounded-md border border-line bg-white px-3 text-xs font-medium text-ink outline-none focus:border-brand"
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                aria-label="AI model"
                disabled={loading}
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {loadingSession && (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-brand" />
              </div>
            )}

            {isEmpty && !loadingSession && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand/10">
                  <Bot className="h-7 w-7 text-brand" />
                </div>
                <h3 className="mb-1 text-base font-semibold">Ask a business question</h3>
                <p className="mb-6 text-sm text-ink/60 max-w-sm">
                  I answer questions using live company data — poultry, feed, soya, sales, inventory, finance, and more.
                </p>
                <div className="grid gap-2 w-full max-w-md">
                  {EXAMPLE_QUESTIONS.slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => void sendMessage(q)}
                      className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-field hover:border-brand/40 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-brand" />
                      {q}
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
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-field border border-line">
                  <Bot className="h-4 w-4 text-ink" />
                </div>
                <div className="flex items-center gap-1 rounded-xl rounded-tl-none border border-line bg-white px-4 py-3 shadow-panel">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink/40 [animation-delay:0ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink/40 [animation-delay:150ms]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-ink/40 [animation-delay:300ms]" />
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Disclaimer */}
          <div className="border-t border-line bg-amber-50 px-5 py-2 text-xs text-amber-700">
            AI insights are advisory only. Validate with your operational teams before making decisions.
          </div>

          {/* Input */}
          <form onSubmit={onSubmit} className="border-t border-line px-4 py-3 flex gap-2">
            <input
              className="flex-1 min-h-10 rounded-md border border-line px-3 text-sm outline-none focus:border-brand placeholder:text-ink/40"
              placeholder="Ask about poultry, sales, inventory, finance…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex min-h-10 min-w-10 items-center justify-center rounded-md bg-brand text-white disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
