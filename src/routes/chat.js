const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/db');

const router = express.Router();

// POST /api/chat
// Streams an Anthropic response using SSE (text/event-stream).
// The JWT user id is pulled from req.user (set by isAuth middleware).
// Body: { message: string, history?: Array<{ role: 'user'|'assistant', content: string }> }
router.post('/', async (req, res) => {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ error: 'message is required' });
    }

    // Fetch the user's stored Anthropic API key
    const [rows] = await db.execute(
        'SELECT anthropic_api_key FROM admin WHERE id = ?',
        [req.user.id]
    );

    if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }

    const apiKey = rows[0].anthropic_api_key;
    if (!apiKey) {
        return res.status(422).json({ error: 'No Anthropic API key saved for this account' });
    }

    // Build the messages array: prior history + new user message
    const allowedRoles = new Set(['user', 'assistant']);
    const messages = [
        ...history
            .filter(m => allowedRoles.has(m.role) && typeof m.content === 'string')
            .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message.trim() },
    ];

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const client = new Anthropic({ apiKey });

    try {
        const stream = await client.messages.stream({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages,
        });

        for await (const event of stream) {
            if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                typeof event.delta.text === 'string'
            ) {
                res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
    } catch (err) {
        console.error('Anthropic stream error:', err);
        res.write(`data: ${JSON.stringify({ error: 'Upstream API error' })}\n\n`);
        res.end();
    }
});

module.exports = router;
