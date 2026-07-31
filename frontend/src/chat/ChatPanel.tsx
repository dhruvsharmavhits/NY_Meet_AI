import { FormEvent, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/meeting/types";
import { CloseIcon, SendIcon } from "@/components/Icons";

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  onClose: () => void;
}

function colorForName(name: string): string {
  const colors = [
    "#c084fc", "#60a5fa", "#fb923c", "#34d399", "#f87171",
    "#818cf8", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || trimmed[0].toUpperCase();
}

export function ChatPanel({ messages, onSend, onClose }: ChatPanelProps) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText("");
  }

  return (
    <div className="flex w-[320px] flex-col panel-slide-enter" style={{ background: "rgba(15, 12, 41, 0.85)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-base font-bold text-white">Messages</h2>
        <button
          id="close-chat"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white/50 hover:bg-white/10 transition-all duration-200"
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)">
                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
              </svg>
            </div>
            <p className="text-sm text-white/30">Messages are visible to everyone in the call</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="mb-4 animate-meet-fade-in">
            <div className="flex items-center gap-2 mb-1">
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg text-[9px] font-bold text-white"
                style={{ backgroundColor: colorForName(m.full_name) }}
              >
                {initialsFor(m.full_name)}
              </div>
              <span className="text-xs font-semibold" style={{ color: colorForName(m.full_name) }}>{m.full_name}</span>
            </div>
            <div className="ml-8 text-sm text-white/80 leading-relaxed">{m.text}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <input
          id="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white placeholder-white/40 focus:bg-white/15 focus:border-[#4285f4]/50 focus:outline-none focus:ring-1 focus:ring-[#4285f4]/30 transition-all duration-200"
        />
        <button
          id="chat-send"
          type="submit"
          disabled={!text.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-[#60a5fa] hover:bg-white/10 disabled:text-white/15 disabled:hover:bg-transparent transition-all duration-200"
          aria-label="Send message"
        >
          <SendIcon size={20} />
        </button>
      </form>
    </div>
  );
}
