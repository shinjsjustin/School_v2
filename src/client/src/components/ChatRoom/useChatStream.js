import { useCallback, useRef, useState } from 'react';

// ────────────────────────────────────────────────────────────────────────────
// useChatStream — generic streaming chat hook with "streamline" directives.
//
// The AI is instructed to embed structured directives in its stream using the
// pattern:
//
//   [[CALL:functionName]]<json payload>[[/CALL]]
//
// As tokens arrive we:
//   1. Append them to the displayed message bubble (MINUS the directive text).
//   2. When a complete directive is parsed, fire the matching handler from
//      `streamlineHandlers` exactly once.
//
// Inputs:
//   • endpoint            — full URL to POST to (must stream SSE)
//   • buildBody(message, history) — returns the JSON body for the POST
//   • streamlineHandlers  — { name: (payload, ctx) => void|Promise<void> }
//   • initialMessages     — seed the thread (e.g. from server hydration)
//   • role keys           — expects { role: 'user'|'assistant', content }
//                           internally; UI may map onto its own who/text shape.
//
// Returns: { messages, setMessages, input, setInput, isStreaming, error,
//            sendMessage, reset }
// ────────────────────────────────────────────────────────────────────────────

const DIRECTIVE_RE = /\[\[CALL:([a-zA-Z0-9_]+)\]\]([\s\S]*?)\[\[\/CALL\]\]/g;

// Strip any complete directives from `text` and return the cleaned version.
const stripDirectives = (text) => text.replace(DIRECTIVE_RE, '').replace(/[ \t]+\n/g, '\n').trim();

// Detect whether the tail of `text` is inside an unclosed directive — if so
// we should hide that tail from the user until it either closes or we know
// it's not really a directive.
const trimUnclosedTail = (text) => {
    const openIdx = text.lastIndexOf('[[CALL:');
    if (openIdx === -1) return text;
    const afterOpen = text.slice(openIdx);
    if (afterOpen.includes('[[/CALL]]')) return text; // already closed
    return text.slice(0, openIdx);
};

export function useChatStream({
    endpoint,
    buildBody,
    streamlineHandlers = {},
    initialMessages = [],
} = {}) {
    const [messages, setMessages] = useState(initialMessages);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState('');

    // Track which directive matches we've already fired so we don't double-fire
    // as more tokens arrive. Keyed by the start index in the raw buffer.
    const firedRef = useRef(new Set());
    const rawBufferRef = useRef('');

    const reset = useCallback(() => {
        setMessages(initialMessages);
        setInput('');
        setError('');
        firedRef.current = new Set();
        rawBufferRef.current = '';
    }, [initialMessages]);

    // Scan the raw buffer for any newly-completed directives and invoke their
    // handlers. Safe to call repeatedly — each match fires at most once.
    const scanDirectives = useCallback(async () => {
        const buf = rawBufferRef.current;
        DIRECTIVE_RE.lastIndex = 0;
        let match;
        while ((match = DIRECTIVE_RE.exec(buf)) !== null) {
            const key = `${match.index}:${match[0].length}`;
            if (firedRef.current.has(key)) continue;
            firedRef.current.add(key);
            const name = match[1];
            const handler = streamlineHandlers[name];
            if (!handler) continue;
            const rawPayload = match[2].trim();
            let payload = rawPayload;
            try {
                payload = JSON.parse(rawPayload);
            } catch (_) {
                // Leave as raw string — handler can decide what to do.
            }
            try {
                await handler(payload, { rawText: match[0] });
            } catch (err) {
                // Surface but don't break the stream.
                // eslint-disable-next-line no-console
                console.error(`streamline handler "${name}" failed`, err);
            }
        }
    }, [streamlineHandlers]);

    const sendMessage = useCallback(async (overrideText, opts = {}) => {
        const { silent = false, body: bodyOverride, endpoint: endpointOverride, onEvent } = opts;
        const userText = (overrideText ?? input).trim();
        if (isStreaming) return;
        if (!silent && !userText) return;

        if (!silent) setInput('');
        setError('');
        firedRef.current = new Set();
        rawBufferRef.current = '';

        const historySnapshot = messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role, content: m.content }));

        // Optimistically render user (unless silent) + empty assistant placeholder.
        setMessages((prev) => {
            const next = [...prev];
            if (!silent) next.push({ role: 'user', content: userText });
            next.push({ role: 'assistant', content: '', streaming: true });
            return next;
        });
        setIsStreaming(true);

        try {
            const body = bodyOverride
                ? bodyOverride
                : buildBody
                    ? buildBody(userText, historySnapshot)
                    : { message: userText, history: historySnapshot };

            const res = await fetch(endpointOverride || endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Server error ${res.status}`);
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let lineBuf = '';

            // Read SSE stream.
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                lineBuf += decoder.decode(value, { stream: true });
                const lines = lineBuf.split('\n');
                lineBuf = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const payload = line.slice(6).trim();
                    if (payload === '[DONE]') break;

                    let parsed;
                    try { parsed = JSON.parse(payload); } catch (_) { continue; }
                    if (parsed.error) throw new Error(parsed.error);
                    if (typeof parsed.token !== 'string') {
                        // Non-token structured event (e.g. end-session summary).
                        if (onEvent) {
                            try { await onEvent(parsed); } catch (err) {
                                // eslint-disable-next-line no-console
                                console.error('onEvent handler failed', err);
                            }
                        }
                        continue;
                    }

                    rawBufferRef.current += parsed.token;
                    const visible = stripDirectives(trimUnclosedTail(rawBufferRef.current));

                    setMessages((prev) =>
                        prev.map((m, i) =>
                            i === prev.length - 1
                                ? { ...m, content: visible }
                                : m,
                        ),
                    );

                    // Fire any newly-complete directive handlers.
                    // eslint-disable-next-line no-await-in-loop
                    await scanDirectives();
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to reach the server.');
            setMessages((prev) => prev.slice(0, -1));
        } finally {
            setMessages((prev) =>
                prev.map((m, i) =>
                    i === prev.length - 1 && m.role === 'assistant'
                        ? { ...m, streaming: false }
                        : m,
                ),
            );
            setIsStreaming(false);
        }
    }, [input, isStreaming, messages, endpoint, buildBody, scanDirectives]);

    return {
        messages,
        setMessages,
        input,
        setInput,
        isStreaming,
        error,
        sendMessage,
        reset,
    };
}
