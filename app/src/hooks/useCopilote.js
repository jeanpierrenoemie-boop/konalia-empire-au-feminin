import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export function useCopilote() {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const abortRef = useRef(null);

  // Load or create thread on mount
  useEffect(() => {
    fetch(`${API}/api/copilote/thread`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error('Thread error');
        return r.json();
      })
      .then(t => {
        setThread(t);
        // Load history
        return fetch(`${API}/api/copilote/history/${t.id}`, { credentials: 'include' });
      })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.messages) {
          setMessages(data.messages.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
          })));
        }
      })
      .catch(() => {});
  }, []);

  const sendMessage = useCallback(async (messageText, shortcutType = 'general') => {
    if (!messageText?.trim() || sending) return;

    const userMsg = { id: `tmp-${Date.now()}`, role: 'user', content: messageText.trim() };
    setMessages(prev => [...prev, userMsg]);
    setSending(true);

    // Placeholder for streaming assistant response
    const assistantMsgId = `streaming-${Date.now()}`;
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', streaming: true }]);

    let fullContent = '';
    let updateBlock = null;

    try {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await fetch(`${API}/api/copilote/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: messageText.trim(), shortcutType, threadId: thread?.id }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (data.unavailable) {
          setUnavailable(true);
          setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
          return;
        }
        throw new Error(data.error ?? 'Erreur réseau');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'delta') {
              fullContent += event.content;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, content: fullContent } : m
              ));
            } else if (event.type === 'done') {
              fullContent = event.content;
              updateBlock = event.update_block ?? null;
              const realId = event.message_id ?? assistantMsgId;
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, id: realId, content: fullContent, streaming: false, update_block: updateBlock }
                  : m
              ));
            }
          } catch {
            // malformed SSE line
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: 'Une erreur est survenue. Réessaie.', streaming: false, error: true }
          : m
      ));
    } finally {
      setSending(false);
    }

    return { updateBlock };
  }, [sending, thread]);

  const applyUpdate = useCallback(async (updates) => {
    try {
      const res = await fetch(`${API}/api/copilote/apply-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threadId: thread?.id, updates }),
      });
      if (!res.ok) throw new Error('Erreur apply-update');
      return await res.json();
    } catch (err) {
      console.error('applyUpdate error:', err);
      return null;
    }
  }, [thread]);

  return { thread, messages, sending, sendMessage, applyUpdate, unavailable };
}
