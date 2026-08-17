import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { SUGGESTIONS } from '../constants';

interface MessageListProps {
  messages: ChatMessage[];
  busy: boolean;
  onSuggest: (text: string) => void;
}

export default function MessageList({ messages, busy, onSuggest }: MessageListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const streamingNow = messages.some((m) => m.streaming);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages" ref={listRef}>
      {messages.length === 0 && (
        <div className="welcome">
          <h2>¿Qué hacemos hoy?</h2>
          <p>Dame una tarea de desarrollo y la ejecuto en tu Mac.</p>
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => onSuggest(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {messages.map((m) => (
        <div key={m.id} className={`bubble ${m.role}`}>
          <div className="bubble-text">
            {m.content}
            {m.streaming && <span className="cursor" />}
          </div>
        </div>
      ))}
      {busy && !streamingNow && (
        <div className="bubble assistant typing" aria-label="procesando">
          <div className="bubble-text">
            <span className="dots">
              <span />
              <span />
              <span />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}