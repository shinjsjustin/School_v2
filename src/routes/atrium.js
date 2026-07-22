// ────────────────────────────────────────────────────────────────────────────
// Atrium API
//
// All routes are mounted under /api/atrium and protected by isAuth, so
// req.user.id is always available. Endpoints are grouped by the front-end
// page they serve. The AI/Anthropic integration is deliberately stubbed —
// chat-message endpoints persist the user message and return a placeholder
// tutor reply so the front-end can render the full thread before the model
// is wired in (see TODO markers).
// ────────────────────────────────────────────────────────────────────────────

const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('../db/db');

const router = express.Router();

// Small helper that wraps async handlers and forwards errors to a JSON 500.
const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch((err) => {
        console.error(`${req.method} ${req.originalUrl} →`, err);
        res.status(500).json({ error: 'Internal server error' });
    });


// ────────────────────────────────────────────────────────────────────────────
// Streaming helper — Anthropic SSE bridge.
//
// Loads the calling user's stored API key, opens a streaming Messages call,
// pipes text deltas to the client as `data: {"token":"..."}\n\n` lines, and
// resolves with the final concatenated assistant text so the caller can
// persist it. Sends `data: [DONE]\n\n` and ends the response itself.
//
// `tools` may include Anthropic's server-side web_search tool for the teacher.
// ────────────────────────────────────────────────────────────────────────────
const streamAnthropic = async ({
    req,
    res,
    system,
    messages,
    model = 'claude-haiku-4-5-20251001',
    maxTokens = 1500,
    tools,
    closeStream = true,
}) => {
    const [rows] = await db.execute(
        'SELECT anthropic_api_key FROM admin WHERE id = ?',
        [req.user.id],
    );
    if (!rows.length) {
        res.status(404).json({ error: 'User not found' });
        return null;
    }
    const apiKey = rows[0].anthropic_api_key;
    if (!apiKey) {
        res.status(422).json({ error: 'No Anthropic API key saved for this account' });
        return null;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const client = new Anthropic({ apiKey });
    let assembled = '';

    try {
        const stream = await client.messages.stream({
            model,
            max_tokens: maxTokens,
            system,
            messages,
            ...(tools ? { tools } : {}),
        });

        for await (const event of stream) {
            if (
                event.type === 'content_block_delta' &&
                event.delta?.type === 'text_delta' &&
                typeof event.delta.text === 'string'
            ) {
                assembled += event.delta.text;
                res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
            }
        }
        if (closeStream) {
            res.write('data: [DONE]\n\n');
            res.end();
        }
        return assembled;
    } catch (err) {
        console.error('Anthropic stream error:', err);
        res.write(`data: ${JSON.stringify({ error: err?.message || 'Upstream API error' })}\n\n`);
        res.end();
        return null;
    }
};


// ════════════════════════════════════════════════════════════════════════════
// PAGE 1 · DASHBOARD       (/atrium)
// ════════════════════════════════════════════════════════════════════════════

// GET /api/atrium/schools
// → [{ id, name, progress }]   — used for the folder grid.
router.get('/schools', wrap(async (req, res) => {
    const [rows] = await db.execute(
        `SELECT slug AS id, name, progress_pct AS progress
           FROM school
          WHERE user_id = ?
          ORDER BY updated_at DESC`,
        [req.user.id]
    );
    res.json(rows);
}));

// GET /api/atrium/stats
// → { monthHours, streak, overallPct }
router.get('/stats', wrap(async (req, res) => {
    const [rows] = await db.execute(
        `SELECT month_hours AS monthHours,
                streak_days AS streak,
                overall_pct AS overallPct
           FROM user_stats
          WHERE user_id = ?`,
        [req.user.id]
    );
    res.json(rows[0] || { monthHours: 0, streak: 0, overallPct: 0 });
}));


// ════════════════════════════════════════════════════════════════════════════
// PAGE 2 · SCHOOL          (/atrium/school/:schoolId)
// ════════════════════════════════════════════════════════════════════════════

// Resolve a slug → { schoolRow }, scoped to this user.
const findSchool = async (userId, slug) => {
    const [rows] = await db.execute(
        `SELECT * FROM school WHERE user_id = ? AND slug = ?`,
        [userId, slug]
    );
    return rows[0] || null;
};

// GET /api/atrium/schools/:schoolId
// → full School page payload: { id, name, tagline, progress, meta, sections }
router.get('/schools/:schoolId', wrap(async (req, res) => {
    const school = await findSchool(req.user.id, req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });

    const [sections] = await db.execute(
        `SELECT id, position, name, progress_pct AS progress
           FROM section
          WHERE school_id = ?
          ORDER BY position`,
        [school.id]
    );

    const [topics] = await db.execute(
        `SELECT t.id, t.section_id, t.position, t.num, t.label, t.status
           FROM topic t
           JOIN section s ON s.id = t.section_id
          WHERE s.school_id = ?
          ORDER BY s.position, t.position`,
        [school.id]
    );

    // Which sections already have a generated test? Drives the "Generate /
    // Take / Regenerate" tri-state on the School page.
    const [testRows] = await db.execute(
        `SELECT t.section_id
           FROM test t
           JOIN section s ON s.id = t.section_id
          WHERE s.school_id = ?`,
        [school.id]
    );
    const sectionsWithTest = new Set(testRows.map((r) => r.section_id));

    // Group topics under their section.
    const sectionsOut = sections.map((sec) => ({
        id: `s${sec.position}`,
        name: sec.name,
        progress: sec.progress,
        hasTest: sectionsWithTest.has(sec.id),
        topics: topics
            .filter((t) => t.section_id === sec.id)
            .map((t) => ({ id: t.num, num: t.num, label: t.label, status: t.status })),
    }));

    const totalTopics = topics.length;
    const completedTopics = topics.filter((t) => t.status === 'done').length;
    const resume = topics.find((t) => t.status !== 'done') || topics[0];

    res.json({
        id: school.slug,
        name: school.name,
        tagline: school.tagline || '',
        progress: school.progress_pct,
        meta: {
            tutor: school.tutor_label,
            sections: sections.length,
            topics: totalTopics,
            completed: completedTopics,
            nextTest: sections.find((s) => s.progress < 100)?.name || sections[0]?.name || '',
            resumeTopicId: resume?.num || '',
            resumeTopicLabel: resume?.label || '',
        },
        sections: sectionsOut,
    });
}));

// POST /api/atrium/schools
// Body: { title, subtitle, sections: [{ name, topics: [string], highlight? }] }
// Used by the Roadmap page to materialise a draft into a real school.
// → { id (slug) }
router.post('/schools', wrap(async (req, res) => {
    const { title, subtitle, sections } = req.body;
    if (!title || !Array.isArray(sections)) {
        return res.status(400).json({ error: 'title and sections[] are required' });
    }

    const slug = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120) || `school-${Date.now()}`;

    const [result] = await db.execute(
        `INSERT INTO school (user_id, slug, name, tagline)
              VALUES (?, ?, ?, ?)`,
        [req.user.id, slug, title, subtitle || null]
    );
    const schoolId = result.insertId;

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const [secResult] = await db.execute(
            `INSERT INTO section (school_id, position, name)
                  VALUES (?, ?, ?)`,
            [schoolId, i + 1, sec.name]
        );
        const sectionId = secResult.insertId;
        const topics = Array.isArray(sec.topics) ? sec.topics : [];
        for (let j = 0; j < topics.length; j++) {
            const num = `${i + 1}.${j + 1}`;
            await db.execute(
                `INSERT INTO topic (section_id, position, num, label)
                      VALUES (?, ?, ?, ?)`,
                [sectionId, j + 1, num, topics[j]]
            );
        }
    }

    res.status(201).json({ id: slug });
}));

// DELETE /api/atrium/schools/:schoolId
router.delete('/schools/:schoolId', wrap(async (req, res) => {
    const school = await findSchool(req.user.id, req.params.schoolId);
    if (!school) return res.status(404).json({ error: 'School not found' });
    await db.execute(`DELETE FROM school WHERE id = ?`, [school.id]);
    res.status(204).end();
}));


// ════════════════════════════════════════════════════════════════════════════
// PAGE 3 · TEACHER         (/atrium/school/:schoolId/topic/:topicId)
// ════════════════════════════════════════════════════════════════════════════

// Resolve a (schoolSlug, topicNum) pair → joined row including section info.
const findTopic = async (userId, schoolSlug, topicNum) => {
    const [rows] = await db.execute(
        `SELECT t.id          AS topic_id,
                t.num,
                t.label       AS topic_label,
                t.status,
                s.id          AS section_id,
                s.name        AS section_name,
                s.progress_pct AS section_progress
           FROM topic t
           JOIN section s ON s.id = t.section_id
           JOIN school  sch ON sch.id = s.school_id
          WHERE sch.user_id = ? AND sch.slug = ? AND t.num = ?`,
        [userId, schoolSlug, topicNum]
    );
    return rows[0] || null;
};

// Recompute denormalised progress: section.progress_pct from topic.status,
// then school.progress_pct from the average across its sections. Called on
// every progression-affecting write so the School page stays accurate.
const recomputeSchoolProgress = async (schoolId) => {
    const [sections] = await db.execute(
        `SELECT id FROM section WHERE school_id = ?`,
        [schoolId],
    );
    for (const sec of sections) {
        const [[counts]] = await db.execute(
            `SELECT COUNT(*) AS total, SUM(status = 'done') AS done
               FROM topic WHERE section_id = ?`,
            [sec.id],
        );
        const pct = counts.total > 0
            ? Math.round((Number(counts.done) / Number(counts.total)) * 100)
            : 0;
        await db.execute(
            `UPDATE section SET progress_pct = ? WHERE id = ?`,
            [pct, sec.id],
        );
    }
    const [[schoolPct]] = await db.execute(
        `SELECT COALESCE(ROUND(AVG(progress_pct)), 0) AS pct
           FROM section WHERE school_id = ?`,
        [schoolId],
    );
    await db.execute(
        `UPDATE school SET progress_pct = ? WHERE id = ?`,
        [schoolPct.pct, schoolId],
    );
};

// Recompute the three dashboard stats for a user and upsert user_stats.
// Called whenever a session ends or a test is submitted so the numbers on
// the Dashboard stay current without a nightly job.
const recomputeUserStats = async (userId) => {
    // overall_pct — average progress across all the user's schools.
    const [[prog]] = await db.execute(
        `SELECT COALESCE(ROUND(AVG(progress_pct)), 0) AS pct
           FROM school
          WHERE user_id = ?`,
        [userId],
    );

    // month_hours — sum of study minutes this calendar month, converted.
    const [[hours]] = await db.execute(
        `SELECT COALESCE(SUM(duration_min) / 60.0, 0) AS h
           FROM study_session
          WHERE user_id = ?
            AND YEAR(started_at)  = YEAR(CURDATE())
            AND MONTH(started_at) = MONTH(CURDATE())`,
        [userId],
    );

    // streak_days — count of consecutive calendar days (ending today or
    // yesterday) on which the user completed at least one study session.
    const [days] = await db.execute(
        `SELECT DATE(started_at) AS d
           FROM study_session
          WHERE user_id = ? AND ended_at IS NOT NULL
          GROUP BY DATE(started_at)
          ORDER BY d DESC`,
        [userId],
    );
    let streak = 0;
    const todayMs = new Date().setHours(0, 0, 0, 0);
    for (let i = 0; i < days.length; i++) {
        const dayMs = new Date(days[i].d).setHours(0, 0, 0, 0);
        const expectedMs = todayMs - i * 86400000;
        if (dayMs === expectedMs) streak++;
        else break;
    }

    await db.execute(
        `INSERT INTO user_stats (user_id, month_hours, streak_days, overall_pct)
              VALUES (?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                month_hours = VALUES(month_hours),
                streak_days = VALUES(streak_days),
                overall_pct = VALUES(overall_pct)`,
        [userId, Math.round(Number(hours.h) * 10) / 10, streak, prog.pct],
    );
};

// Set topic.status to a new value AND cascade progress recompute. `desired`
// is only applied if it represents a forward step (start → active → ended/done)
// so that, e.g., resuming an 'ended' topic flips it back to 'active'.
const advanceTopicStatus = async (topicId, desired) => {
    const [[row]] = await db.execute(
        `SELECT t.status, s.school_id
           FROM topic t JOIN section s ON s.id = t.section_id
          WHERE t.id = ?`,
        [topicId],
    );
    if (!row) return;
    // Allow any explicit status set — the caller knows what it wants. We just
    // keep 'done' sticky: once done, only an objective regression unsets it.
    if (row.status === 'done' && desired !== 'done') return;
    if (row.status !== desired) {
        await db.execute(`UPDATE topic SET status = ? WHERE id = ?`, [desired, topicId]);
    }
    await recomputeSchoolProgress(row.school_id);
};

// GET /api/atrium/schools/:schoolId/topics/:topicId
// → { section, topic, progress, objectives, resources, messages, draftReply }
router.get('/schools/:schoolId/topics/:topicId', wrap(async (req, res) => {
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const [objectives] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id]
    );

    const [resources] = await db.execute(
        `SELECT id, label, url
           FROM topic_resource
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id]
    );

    const [messages] = await db.execute(
        `SELECT who, body AS text
           FROM topic_message
          WHERE topic_id = ? AND user_id = ?
          ORDER BY created_at`,
        [topic.topic_id, req.user.id]
    );

    const [notes] = await db.execute(
        `SELECT id, note, created_at
           FROM topic_session_note
          WHERE topic_id = ? AND user_id = ?
          ORDER BY created_at DESC`,
        [topic.topic_id, req.user.id]
    );

    res.json({
        section: topic.section_name,
        topic: topic.topic_label,
        progress: topic.section_progress,
        status: topic.status,
        objectives: objectives.map((o) => ({ id: o.id, text: o.text, state: o.state })),
        resources: resources.map((r) => ({ id: r.id, label: r.label, url: r.url })),
        messages,
        notes: notes.map((n) => ({ id: n.id, note: n.note, createdAt: n.created_at })),
        // The draft reply textarea is purely client-state for now; persist if
        // we add a `chat_draft` table later.
        draftReply: '',
    });
}));

// POST /api/atrium/schools/:schoolId/topics/:topicId/notes
// Body: { note }
// Persists a tutor-authored session note (typically emitted by the
// `update_progress` streamline directive).
// → { note: { id, note, createdAt } }
router.post('/schools/:schoolId/topics/:topicId/notes', wrap(async (req, res) => {
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
    if (!note) return res.status(400).json({ error: 'note is required' });
    if (note.length > 1000) {
        return res.status(400).json({ error: 'note must be ≤ 1000 chars' });
    }
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const [result] = await db.execute(
        `INSERT INTO topic_session_note (topic_id, user_id, note)
              VALUES (?, ?, ?)`,
        [topic.topic_id, req.user.id, note]
    );
    const [rows] = await db.execute(
        `SELECT id, note, created_at FROM topic_session_note WHERE id = ?`,
        [result.insertId]
    );
    res.status(201).json({
        note: { id: rows[0].id, note: rows[0].note, createdAt: rows[0].created_at },
    });
}));

// PATCH /api/atrium/objectives/:objectiveId
// Body: { state: 'todo'|'current'|'done' }
//
// Verifies the objective belongs to a school owned by req.user (defence
// against IDOR), updates the state, and — when every objective on the topic
// reaches 'done' — auto-promotes topic.status to 'done' so progression
// rolls up to the School page.
router.patch('/objectives/:objectiveId', wrap(async (req, res) => {
    const { state } = req.body;
    if (!['todo', 'current', 'done'].includes(state)) {
        return res.status(400).json({ error: 'Invalid state' });
    }

    const [owned] = await db.execute(
        `SELECT o.id, o.topic_id
           FROM topic_objective o
           JOIN topic   t   ON t.id = o.topic_id
           JOIN section s   ON s.id = t.section_id
           JOIN school  sch ON sch.id = s.school_id
          WHERE o.id = ? AND sch.user_id = ?`,
        [req.params.objectiveId, req.user.id],
    );
    if (!owned.length) return res.status(404).json({ error: 'Objective not found' });

    await db.execute(
        `UPDATE topic_objective SET state = ? WHERE id = ?`,
        [state, req.params.objectiveId]
    );

    // Auto-promote topic when every objective is done.
    const topicId = owned[0].topic_id;
    const [[counts]] = await db.execute(
        `SELECT COUNT(*) AS total,
                SUM(state = 'done') AS done
           FROM topic_objective
          WHERE topic_id = ?`,
        [topicId],
    );
    if (counts.total > 0 && Number(counts.done) === Number(counts.total)) {
        await advanceTopicStatus(topicId, 'done');
    } else {
        // Recompute anyway in case state moved away from done (regression).
        const [[topicRow]] = await db.execute(
            `SELECT t.status, s.school_id
               FROM topic t JOIN section s ON s.id = t.section_id
              WHERE t.id = ?`,
            [topicId],
        );
        if (topicRow?.status === 'done') {
            await db.execute(`UPDATE topic SET status = 'active' WHERE id = ?`, [topicId]);
        }
        if (topicRow) await recomputeSchoolProgress(topicRow.school_id);
    }

    res.status(204).end();
}));

// POST /api/atrium/schools/:schoolId/topics/:topicId/messages
// Body: { message }
// Persists the user's message and returns a placeholder tutor reply.
// → { userMessage, tutorMessage }
//
// TODO (AI): replace the canned tutor body with a streamed Anthropic call
// that uses prior topic_message rows as the conversation history.
router.post('/schools/:schoolId/topics/:topicId/messages', wrap(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    await db.execute(
        `INSERT INTO topic_message (topic_id, user_id, who, body)
              VALUES (?, ?, 'me', ?)`,
        [topic.topic_id, req.user.id, message.trim()]
    );

    // TODO (AI): generate a real tutor reply here.
    const placeholder = '…(tutor reply pending — AI integration not yet wired)';
    await db.execute(
        `INSERT INTO topic_message (topic_id, user_id, who, body)
              VALUES (?, ?, 'tutor', ?)`,
        [topic.topic_id, req.user.id, placeholder]
    );

    res.status(201).json({
        userMessage: { who: 'me', text: message.trim() },
        tutorMessage: { who: 'tutor', text: placeholder },
    });
}));

// POST /api/atrium/schools/:schoolId/topics/:topicId/objectives/generate
// SSE endpoint that streams a freshly authored set of learning objectives,
// persists them to topic_objective, and emits a final structured payload
// containing the saved rows (with their ids).
//
// Stream events:
//   data: {"token": "..."}                — incremental tokens (UI feedback)
//   data: {"objectives": [{...}, ...]}    — final saved rows (with ids)
//   data: {"error": "..."}                — failure
//   data: [DONE]
//
// Behaviour:
//   • If the topic already has objectives, returns them immediately as the
//     final payload without calling the model.
//   • On generation, replaces any existing objectives for this topic so the
//     positions stay 1..N consistently.
router.post('/schools/:schoolId/topics/:topicId/objectives/generate', wrap(async (req, res) => {
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    // Short-circuit: already populated → return existing rows.
    const [existing] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id],
    );
    if (existing.length) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({
            objectives: existing.map((o) => ({ id: o.id, text: o.text, state: o.state })),
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
    }

    // Pull roadmap context so the LOs are anchored in the broader plan.
    const [schoolRows] = await db.execute(
        `SELECT id, name, tagline FROM school WHERE user_id = ? AND slug = ?`,
        [req.user.id, req.params.schoolId],
    );
    const school = schoolRows[0];
    const [roadmapRows] = school ? await db.execute(
        `SELECT s.position AS section_pos, s.name AS section_name,
                t.num, t.label
           FROM section s
           LEFT JOIN topic t ON t.section_id = s.id
          WHERE s.school_id = ?
          ORDER BY s.position, t.position`,
        [school.id],
    ) : [[]];

    const roadmapBlock = (() => {
        if (!roadmapRows.length) return '  (no roadmap available)';
        const bySection = new Map();
        for (const r of roadmapRows) {
            if (!bySection.has(r.section_pos)) {
                bySection.set(r.section_pos, { name: r.section_name, topics: [] });
            }
            if (r.num) {
                const marker = r.num === topic.num ? '►' : '·';
                bySection.get(r.section_pos).topics.push(`      ${marker} ${r.num} ${r.label}`);
            }
        }
        return [...bySection.entries()]
            .map(([pos, sec]) => `  ${pos}. ${sec.name}\n${sec.topics.join('\n')}`)
            .join('\n');
    })();

    const system = `You are a curriculum designer authoring learning objectives for a one-on-one Socratic tutoring session.

ROADMAP — ${school?.name || 'this school'}${school?.tagline ? ` (${school.tagline})` : ''}
${roadmapBlock}

TARGET TOPIC
  Section : ${topic.section_name}
  Topic   : ${topic.num} ${topic.topic_label}

TASK
  Author 4–6 concise learning objectives the learner will achieve in this
  session. Each objective should:
    • Start with an action verb (Explain, Compare, Apply, Derive, Identify…).
    • Be testable in one short conversation.
    • Be scoped to THIS topic — do not duplicate sibling topics on the roadmap.
    • Build on prior topics where appropriate.

OUTPUT FORMAT
  Return ONLY a JSON array, no prose, no code fences. Example:
  [
    {"text": "Explain why X happens"},
    {"text": "Compare A and B in terms of C"}
  ]`;

    const assistantText = await streamAnthropic({
        req,
        res,
        system,
        messages: [{ role: 'user', content: 'Author the learning objectives now.' }],
        maxTokens: 800,
        closeStream: false,
    });

    if (typeof assistantText !== 'string' || !assistantText.trim()) {
        // streamAnthropic already ended the response on error.
        return;
    }

    // Extract a JSON array from the assembled text. Tolerate stray prose or
    // accidental code fences by grabbing the first `[ ... ]` block.
    const match = assistantText.match(/\[[\s\S]*\]/);
    let parsed = [];
    if (match) {
        try { parsed = JSON.parse(match[0]); } catch (_) { parsed = []; }
    }
    const cleaned = (Array.isArray(parsed) ? parsed : [])
        .map((o) => (typeof o === 'string' ? { text: o } : o))
        .filter((o) => o && typeof o.text === 'string' && o.text.trim())
        .map((o) => ({ text: o.text.trim().slice(0, 500) }))
        .slice(0, 8);

    if (!cleaned.length) {
        res.write(`data: ${JSON.stringify({ error: 'Could not parse objectives' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
    }

    // Persist atomically: wipe any partial rows first (defensive — should
    // be empty thanks to the short-circuit above) then insert in order.
    await db.execute(`DELETE FROM topic_objective WHERE topic_id = ?`, [topic.topic_id]);
    for (let i = 0; i < cleaned.length; i++) {
        await db.execute(
            `INSERT INTO topic_objective (topic_id, position, text, state)
                  VALUES (?, ?, ?, 'todo')`,
            [topic.topic_id, i + 1, cleaned[i].text],
        );
    }
    const [saved] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id],
    );

    res.write(`data: ${JSON.stringify({
        objectives: saved.map((o) => ({ id: o.id, text: o.text, state: o.state })),
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}));

// POST /api/atrium/schools/:schoolId/topics/:topicId/stream
// SSE streaming reply from the Socratic tutor. Persists the user's message
// before streaming and the tutor reply after the stream completes.
//
// The system prompt is conditioned on the topic + objectives + progress AND
// the broader school roadmap (sibling sections/topics) so the tutor knows
// where this lesson sits in the user's overall plan. It instructs the model
// to emit `update_progress` streamline calls when the user demonstrates
// mastery or a session note is worth saving.
//
// Body:
//   { message, history }              — normal user turn
//   { kickoff: true, history? }       — open the lesson; no user bubble persisted
//   { kickoff: true, resume: true }   — resume an ended session; injects the
//                                       prior session notes + objective state
//                                       into the system prompt so the tutor
//                                       picks up where it left off.
router.post('/schools/:schoolId/topics/:topicId/stream', wrap(async (req, res) => {
    const { message, history = [], kickoff = false, resume = false } = req.body;
    if (!kickoff && (!message || typeof message !== 'string' || !message.trim())) {
        return res.status(400).json({ error: 'message is required' });
    }
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const [objectives] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id],
    );

    // Roadmap context — give the tutor a view of the whole school so it can
    // anchor the lesson against what came before and what comes next.
    const [schoolRows] = await db.execute(
        `SELECT id, name, tagline, progress_pct
           FROM school
          WHERE user_id = ? AND slug = ?`,
        [req.user.id, req.params.schoolId],
    );
    const school = schoolRows[0];
    const [roadmapRows] = school ? await db.execute(
        `SELECT s.position AS section_pos, s.name AS section_name,
                t.num, t.label, t.status
           FROM section s
           LEFT JOIN topic t ON t.section_id = s.id
          WHERE s.school_id = ?
          ORDER BY s.position, t.position`,
        [school.id],
    ) : [[]];

    // Persist the user bubble immediately so the thread survives a disconnect.
    // For kickoff we deliberately skip persistence — there is no user turn.
    if (!kickoff) {
        await db.execute(
            `INSERT INTO topic_message (topic_id, user_id, who, body)
                  VALUES (?, ?, 'me', ?)`,
            [topic.topic_id, req.user.id, message.trim()],
        );
    }

    // Mark the topic as active on the very first turn so revisits know the
    // lesson is in progress (and so the School page progress reflects it once
    // objectives complete). Does not regress 'done' — advanceTopicStatus skips.
    if (topic.status === 'start' || topic.status === 'ended') {
        await advanceTopicStatus(topic.topic_id, 'active');
    }

    // For resume kickoffs, gather prior session notes so the tutor can
    // pick up the thread without re-reading every message.
    let resumeBlock = '';
    if (resume) {
        const [priorNotes] = await db.execute(
            `SELECT note, created_at
               FROM topic_session_note
              WHERE topic_id = ? AND user_id = ?
              ORDER BY created_at DESC
              LIMIT 10`,
            [topic.topic_id, req.user.id],
        );
        const notesList = priorNotes.length
            ? priorNotes.map((n) => `  • ${n.note}`).join('\n')
            : '  (no prior notes)';
        resumeBlock = `RESUMING SESSION
  The learner is returning after pausing. Recent session notes (newest first):
${notesList}
  Current objective states are shown above. Briefly acknowledge where you left
  off (one short sentence), then resume with the most relevant next question.

`;
    }

    const objectivesBlock = objectives.length
        ? objectives
            .map((o) => `  - [#${o.id} · ${o.state}] ${o.text}`)
            .join('\n')
        : '  (none defined yet)';

    // Group roadmap rows by section for a compact outline.
    const roadmapBlock = (() => {
        if (!roadmapRows.length) return '  (no roadmap available)';
        const bySection = new Map();
        for (const r of roadmapRows) {
            if (!bySection.has(r.section_pos)) {
                bySection.set(r.section_pos, { name: r.section_name, topics: [] });
            }
            if (r.num) {
                const marker = r.num === topic.num ? '►' : (r.status === 'done' ? '✓' : '·');
                bySection.get(r.section_pos).topics.push(`      ${marker} ${r.num} ${r.label}`);
            }
        }
        return [...bySection.entries()]
            .map(([pos, sec]) => `  ${pos}. ${sec.name}\n${sec.topics.join('\n')}`)
            .join('\n');
    })();

    const system = `You are Magister, a Socratic tutor running a fast, focused one-on-one session.

ROADMAP — ${school?.name || 'this school'}${school?.tagline ? ` (${school.tagline})` : ''}
${roadmapBlock}

CURRENT CONTEXT
  Section : ${topic.section_name}
  Topic   : ${topic.num} ${topic.topic_label}
  Section progress: ${topic.section_progress}%
Learning objectives:
${objectivesBlock}

PACING — 3-MESSAGE LOOP PER OBJECTIVE (STRICT ON QUANTITY, NOT LENGTH)
  Cover exactly ONE objective at a time — the one marked "current". Each
  objective should complete in a 3-message loop:
    (1) YOU  — the PROMPT: bundle 2–4 tightly related questions in a SINGLE
        message that together probe the whole objective. Feel free to open
        with a sentence or two of warm framing or a brief illustration before
        the questions — this should read like a real teacher talking, not a
        quiz bot. Length is flexible; what matters is that it's one message.
    (2) LEARNER — their answer (one message).
    (3) YOU  — the FEEDBACK: affirm what's correct, address misconceptions,
        add any explanation the learner needs. Be as thorough as the answer
        warrants — brevity is not the goal, message count is. End the message
        with EXACTLY this closing question:
        "Ready to move on, or want to dive deeper here?"

  Branching on the learner's reply to (3):
    • "Move on" / clear mastery → in your NEXT message, emit ONE streamline
      call that marks the current objective "done" AND the next "todo"→"current",
      then immediately deliver step (1) for the next objective in the SAME
      message (a short transition sentence bridging the two is welcome).
    • "Dive deeper" / partial understanding → run ONE more (1)→(2)→(3) cycle
      on the SAME objective, then ask the closing question again.
    • Off-topic reply → gently redirect in one or two sentences and re-ask.

  Hard rules:
    • NEVER ask a single question by itself when a bundled prompt is possible.
    • NEVER split one teacher turn into multiple back-to-back messages.
    • NEVER drift beyond the current objective.
    • When the LAST objective is marked "done", your next message is the
      LESSON RECAP (see below) — do NOT open another loop.

LESSON RECAP (final teacher message, once every objective is "done")
  Deliver a single closing message that:
    • Warmly acknowledges finishing the topic.
    • Walks through EACH objective in order, summarising the key idea the
      learner should now hold and any concrete example that landed. This
      is a proper recap — don't be terse; make it a useful study reference.
    • Calls out one or two connections to what comes next in the roadmap.
    • Ends by telling the learner to press End Session to save progress.
  Do NOT ask any questions in this message. Do NOT emit a streamline call
  (all objectives are already "done"; the end-session flow handles the rest).

STYLE
  Warm, conversational, plain language — talk like a patient human teacher.
  Use analogies, brief examples, and gentle encouragement. Anchor in the
  roadmap when it helps. You may use the web_search tool sparingly for
  fresh facts or citations.

${kickoff && !resume ? `OPENING THE LESSON
  This is the first turn. In ONE message:
    1. A brief, warm framing of why this topic matters (a sentence or two).
    2. A streamline call marking the first objective "current".
    3. Step (1) of the loop for that first objective — the bundled prompt.

` : ''}${resumeBlock}STREAMLINE CALLS
  When an objective is finished, OR the next one begins, emit EXACTLY ONE
  call on its own line using this format:

  [[CALL:update_progress]]{"objectives":[{"id":<id>,"state":"done"},{"id":<next_id>,"state":"current"}],"note":"<one-sentence session note>"}[[/CALL]]

  Allowed states: "todo" | "current" | "done". Use the numeric ids shown above.
  Include the note only when meaningful progress was made. Omit the call
  entirely if nothing has changed. Never wrap it in code fences. The call is
  metadata — keep your conversational reply natural around it.`;

    const allowedRoles = new Set(['user', 'assistant']);
    const messages = kickoff
        ? [{ role: 'user', content: resume ? 'Please resume the lesson now.' : 'Please begin the lesson now.' }]
        : [
            ...history
                .filter((m) => allowedRoles.has(m.role) && typeof m.content === 'string')
                .map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: message.trim() },
        ];

    const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
    const assistantText = await streamAnthropic({
        req,
        res,
        system,
        messages,
        tools,
    });

    if (typeof assistantText === 'string' && assistantText.trim()) {
        await db.execute(
            `INSERT INTO topic_message (topic_id, user_id, who, body)
                  VALUES (?, ?, 'tutor', ?)`,
            [topic.topic_id, req.user.id, assistantText],
        );
    }
}));

// POST /api/atrium/schools/:schoolId/topics/:topicId/end-session/stream
// SSE wrap-up turn. The tutor:
//   1. Streams a short, warm closing message to the learner.
//   2. Emits an `update_progress` streamline call with final objective states
//      and a one-sentence session note that summarises today's progress.
// After the stream closes the server flips topic.status:
//   • 'done'   if every objective is now 'done'
//   • 'ended'  otherwise (resumable on next visit)
// ...and recomputes section/school progress.
//
// The final SSE event before [DONE] carries the new status + saved objective
// rows so the client can update without an extra fetch.
router.post('/schools/:schoolId/topics/:topicId/end-session/stream', wrap(async (req, res) => {
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const [objectives] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id],
    );

    const [recentMessages] = await db.execute(
        `SELECT who, body
           FROM topic_message
          WHERE topic_id = ? AND user_id = ?
          ORDER BY created_at DESC
          LIMIT 30`,
        [topic.topic_id, req.user.id],
    );
    const conversation = recentMessages.reverse()
        .map((m) => `${m.who === 'tutor' ? 'Tutor' : 'Learner'}: ${m.body}`)
        .join('\n');

    const objectivesBlock = objectives.length
        ? objectives.map((o) => `  - [#${o.id} · ${o.state}] ${o.text}`).join('\n')
        : '  (none defined)';

    const system = `You are Magister, a Socratic tutor wrapping up a session.

CURRENT CONTEXT
  Section : ${topic.section_name}
  Topic   : ${topic.num} ${topic.topic_label}
Learning objectives (current state):
${objectivesBlock}

CONVERSATION SO FAR
${conversation || '  (the learner ended the session before any exchange)'}

TASK
  1. Honestly reassess every objective based on the conversation above. For
     each, assign final state: "done" (clearly demonstrated), "current" (in
     progress, partial understanding), or "todo" (not yet covered).
  2. Write a one-sentence session note summarising today's progress (what
     was discussed, what stuck, what's next).
  3. Compose a brief closing message to the learner — 2-3 sentences max,
     warm but honest. If progress is partial, name what's left to revisit.

OUTPUT FORMAT
  Begin with the streamline call on its own line, then the closing message:

  [[CALL:update_progress]]{"objectives":[{"id":<id>,"state":"<state>"}, ...],"note":"<one-sentence summary>"}[[/CALL]]

  <2-3 sentence closing message>

  Include EVERY objective in the call so the final state is unambiguous.
  Allowed states: "todo" | "current" | "done". Never wrap in code fences.`;

    const assistantText = await streamAnthropic({
        req,
        res,
        system,
        messages: [{ role: 'user', content: 'End the session now.' }],
        maxTokens: 1000,
        closeStream: false,
    });

    if (typeof assistantText !== 'string') return; // error already sent

    // Parse the streamline directive ourselves so we can persist objectives
    // and the note authoritatively (the client also has its handler, but the
    // server is the source of truth for ending state).
    const directiveRe = /\[\[CALL:update_progress\]\]([\s\S]*?)\[\[\/CALL\]\]/;
    const m = assistantText.match(directiveRe);
    if (m) {
        let payload = null;
        try { payload = JSON.parse(m[1].trim()); } catch (_) { /* ignore */ }
        if (payload && Array.isArray(payload.objectives)) {
            const allowed = new Set(['todo', 'current', 'done']);
            const validIds = new Set(objectives.map((o) => o.id));
            for (const u of payload.objectives) {
                if (validIds.has(u.id) && allowed.has(u.state)) {
                    await db.execute(
                        `UPDATE topic_objective SET state = ? WHERE id = ?`,
                        [u.state, u.id],
                    );
                }
            }
        }
        if (payload && typeof payload.note === 'string' && payload.note.trim()) {
            await db.execute(
                `INSERT INTO topic_session_note (topic_id, user_id, note)
                      VALUES (?, ?, ?)`,
                [topic.topic_id, req.user.id, payload.note.trim().slice(0, 1000)],
            );
        }
    }

    // Persist the closing message (with directive stripped) as a tutor bubble.
    const closingText = assistantText.replace(directiveRe, '').trim();
    if (closingText) {
        await db.execute(
            `INSERT INTO topic_message (topic_id, user_id, who, body)
                  VALUES (?, ?, 'tutor', ?)`,
            [topic.topic_id, req.user.id, closingText],
        );
    }

    // Flip topic status based on final objective state, then recompute.
    const [finalObjectives] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id],
    );
    const total = finalObjectives.length;
    const done = finalObjectives.filter((o) => o.state === 'done').length;
    const newStatus = total > 0 && done === total ? 'done' : 'ended';
    await advanceTopicStatus(topic.topic_id, newStatus);

    // Record this study session and refresh the dashboard stats.
    await db.execute(
        `INSERT INTO study_session (user_id, school_id, ended_at, duration_min)
              SELECT ?, sch.id, CURRENT_TIMESTAMP, 20
                FROM school sch
               WHERE sch.user_id = ? AND sch.slug = ?`,
        [req.user.id, req.user.id, req.params.schoolId],
    );
    await recomputeUserStats(req.user.id);

    res.write(`data: ${JSON.stringify({
        sessionEnded: true,
        status: newStatus,
        objectives: finalObjectives.map((o) => ({ id: o.id, text: o.text, state: o.state })),
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}));

// POST /api/atrium/schools/:schoolId/topics/:topicId/hint/stream
// SSE "tap out" — the tutor leaves Socratic mode and explains the answer
// for any objective that is not yet `done`. The reply is persisted to the
// chat as a normal tutor message but no progression is implied (the learner
// asked to be told, not assessed).
router.post('/schools/:schoolId/topics/:topicId/hint/stream', wrap(async (req, res) => {
    const topic = await findTopic(req.user.id, req.params.schoolId, req.params.topicId);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });

    const [objectives] = await db.execute(
        `SELECT id, position, text, state
           FROM topic_objective
          WHERE topic_id = ?
          ORDER BY position`,
        [topic.topic_id],
    );

    const pending = objectives.filter((o) => o.state !== 'done');
    if (!pending.length) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.flushHeaders();
        res.write(`data: ${JSON.stringify({ token: 'Every objective is already complete — nothing left to explain. Press End Session to wrap up.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
    }

    const objectivesBlock = pending
        .map((o) => `  - [#${o.id}] ${o.text}`)
        .join('\n');

    const system = `You are Magister, a tutor switching from Socratic mode to direct EXPLAINING mode.

CURRENT CONTEXT
  Section : ${topic.section_name}
  Topic   : ${topic.num} ${topic.topic_label}

PENDING LEARNING OBJECTIVES (the ones you have NOT yet covered with the learner):
${objectivesBlock}

TASK
  The learner has tapped out and is asking to be told the answer. For each
  pending objective above, give the explanation / key answer the Socratic
  questions were leading to. Keep each one short (2-4 sentences), concrete,
  and actionable. Use a numbered list, one item per objective, in the same
  order. Open with one sentence acknowledging the mode switch (e.g. "Switching
  to explainer mode — here's what we were working toward:"). Do NOT ask any
  follow-up questions. Do NOT emit any streamline calls.`;

    const assistantText = await streamAnthropic({
        req,
        res,
        system,
        messages: [{ role: 'user', content: 'Switch to explainer mode and walk me through the pending objectives.' }],
        maxTokens: 1500,
    });

    if (typeof assistantText === 'string' && assistantText.trim()) {
        await db.execute(
            `INSERT INTO topic_message (topic_id, user_id, who, body)
                  VALUES (?, ?, 'tutor', ?)`,
            [topic.topic_id, req.user.id, assistantText],
        );
    }
}));


// ════════════════════════════════════════════════════════════════════════════
// PAGE 4 · TEST            (/atrium/school/:schoolId/test/:sectionId)
// ════════════════════════════════════════════════════════════════════════════

// Section ids in the front-end are positional (`s1`, `s2`, …). Resolve to
// the underlying section row, scoped to the user.
const findSection = async (userId, schoolSlug, sectionId) => {
    const position = parseInt(String(sectionId).replace(/^s/i, ''), 10);
    if (Number.isNaN(position)) return null;
    const [rows] = await db.execute(
        `SELECT s.id, s.name, s.position
           FROM section s
           JOIN school sch ON sch.id = s.school_id
          WHERE sch.user_id = ? AND sch.slug = ? AND s.position = ?`,
        [userId, schoolSlug, position]
    );
    return rows[0] || null;
};

// Find the user's latest in-progress (un-submitted) attempt for a test, or
// lazily create a new one. Submitted attempts are kept as history; calling
// this again after a submit therefore starts a fresh attempt automatically,
// which is what powers the "take the test as many times as you'd like" flow.
const findOrCreateActiveAttempt = async (userId, testId) => {
    const [existing] = await db.execute(
        `SELECT * FROM test_attempt
          WHERE test_id = ? AND user_id = ? AND submitted_at IS NULL
          ORDER BY id DESC
          LIMIT 1`,
        [testId, userId]
    );
    if (existing[0]) return existing[0];
    const [result] = await db.execute(
        `INSERT INTO test_attempt (test_id, user_id) VALUES (?, ?)`,
        [testId, userId]
    );
    const [created] = await db.execute(
        `SELECT * FROM test_attempt WHERE id = ?`,
        [result.insertId]
    );
    return created[0];
};

// Most-recent attempt regardless of state — used by the results view so a
// user who just submitted can still see their grading on next hydration.
const findLatestAttempt = async (userId, testId) => {
    const [rows] = await db.execute(
        `SELECT * FROM test_attempt
          WHERE test_id = ? AND user_id = ?
          ORDER BY id DESC
          LIMIT 1`,
        [testId, userId]
    );
    return rows[0] || null;
};

// Sync (non-streaming) Anthropic call. Used by the test generator and grader
// where we want the full structured payload before responding to the client.
const callAnthropicSync = async ({
    req,
    system,
    messages,
    maxTokens = 2000,
    model = 'claude-haiku-4-5-20251001',
}) => {
    const [rows] = await db.execute(
        'SELECT anthropic_api_key FROM admin WHERE id = ?',
        [req.user.id],
    );
    if (!rows.length) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }
    const apiKey = rows[0].anthropic_api_key;
    if (!apiKey) {
        const err = new Error('No Anthropic API key saved for this account');
        err.status = 422;
        throw err;
    }
    const client = new Anthropic({ apiKey });
    const result = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages,
    });
    return (result.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');
};

// Pull the first balanced JSON object/array out of a model response. Tolerant
// of stray prose or accidental ```json fences.
const extractJson = (text) => {
    if (typeof text !== 'string') return null;
    // Prefer JSON inside the first {...} block; fall back to [...] arrays.
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
        try { return JSON.parse(objMatch[0]); } catch (_) { /* fall through */ }
    }
    const arrMatch = text.match(/\[[\s\S]*\]/);
    if (arrMatch) {
        try { return JSON.parse(arrMatch[0]); } catch (_) { /* noop */ }
    }
    return null;
};

// Gather the rich section context (topics + objectives + session notes) the
// generator/grader prompts need. Returns a plain string ready to drop into a
// system prompt.
const buildSectionContext = async (sectionId) => {
    const [topics] = await db.execute(
        `SELECT id, num, label, status
           FROM topic WHERE section_id = ?
          ORDER BY position`,
        [sectionId],
    );
    if (!topics.length) return '  (no topics in this section)';

    const topicIds = topics.map((t) => t.id);
    const placeholders = topicIds.map(() => '?').join(',');
    const [objectives] = await db.execute(
        `SELECT topic_id, position, text, state
           FROM topic_objective
          WHERE topic_id IN (${placeholders})
          ORDER BY topic_id, position`,
        topicIds,
    );
    const [notes] = await db.execute(
        `SELECT topic_id, note
           FROM topic_session_note
          WHERE topic_id IN (${placeholders})
          ORDER BY topic_id, created_at DESC`,
        topicIds,
    );

    return topics.map((t) => {
        const tObjs = objectives.filter((o) => o.topic_id === t.id);
        const tNotes = notes.filter((n) => n.topic_id === t.id).slice(0, 5);
        const objLines = tObjs.length
            ? tObjs.map((o) => `      [${o.state}] ${o.text}`).join('\n')
            : '      (no objectives recorded)';
        const noteLines = tNotes.length
            ? tNotes.map((n) => `      \u2022 ${n.note}`).join('\n')
            : '      (no session notes)';
        return `  \u25b8 ${t.num} ${t.label}  (status: ${t.status})\n    Objectives:\n${objLines}\n    Session notes:\n${noteLines}`;
    }).join('\n');
};

// Render a single attempt + its responses (used by GET, submit, retake so all
// three return the same hydrated shape).
const hydrateAttempt = async ({ section, test, attempt, questions }) => {
    const [responses] = await db.execute(
        `SELECT question_id, status, response_text, word_count,
                score_pct, is_correct, feedback
           FROM test_response
          WHERE attempt_id = ?`,
        [attempt.id]
    );
    const respByQ = new Map(responses.map((r) => [r.question_id, r]));

    const submitted = !!attempt.submitted_at;
    const graded = !!attempt.graded_at;

    const questionList = questions.map((q) => {
        const r = respByQ.get(q.id);
        let status = 'open';
        if (!submitted && q.num === attempt.current_question) status = 'current';
        else if (r?.status === 'flagged' && !submitted) status = 'flagged';
        else if (r?.status === 'answered') status = 'answered';
        return {
            num: q.num,
            kind: q.kind,
            status,
            stem: q.stem,
            grade: graded && r ? {
                scorePct: r.score_pct,
                isCorrect: r.is_correct === null ? null : !!r.is_correct,
                feedback: r.feedback || '',
            } : null,
        };
    });

    const cur = questions.find((q) => q.num === attempt.current_question) || questions[0];
    const curResp = cur ? respByQ.get(cur.id) : null;

    return {
        section: section.name,
        current: attempt.current_question,
        total: test.total_questions || questions.length,
        questions: questionList,
        currentQuestion: cur ? {
            num: cur.num,
            kind: cur.kind,
            stem: cur.stem,
            hint: cur.hint,
            draftResponse: curResp?.response_text || '',
            wordCount: curResp?.word_count || 0,
            wordLimit: cur.word_limit || 0,
            autoSavedSec: 0,
            grade: graded && curResp ? {
                scorePct: curResp.score_pct,
                isCorrect: curResp.is_correct === null ? null : !!curResp.is_correct,
                feedback: curResp.feedback || '',
            } : null,
        } : null,
        attempt: {
            id: attempt.id,
            submittedAt: attempt.submitted_at,
            gradedAt: attempt.graded_at,
            scorePct: attempt.score_pct,
            graderSummary: attempt.grader_summary || '',
            readOnly: submitted,
        },
    };
};

// Resolve section + its (possibly missing) test row in one go. The 404 here
// is a soft signal — the front-end uses it to render "Generate Test".
const findSectionTest = async (req) => {
    const section = await findSection(req.user.id, req.params.schoolId, req.params.sectionId);
    if (!section) return { error: { status: 404, message: 'Section not found' } };
    const [tests] = await db.execute(
        `SELECT * FROM test WHERE section_id = ?`,
        [section.id]
    );
    return { section, test: tests[0] || null };
};

// GET /api/atrium/schools/:schoolId/tests/:sectionId
// → { section, status, ...attempt payload if generated }
//
//   status: 'not_generated' — no test row yet (front-end shows Generate Test)
//   status: 'ready'         — full attempt payload (taking or results view)
router.get('/schools/:schoolId/tests/:sectionId', wrap(async (req, res) => {
    const ctx = await findSectionTest(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });
    const { section, test } = ctx;

    if (!test) {
        return res.json({ section: section.name, status: 'not_generated' });
    }

    const attempt = await findOrCreateActiveAttempt(req.user.id, test.id)
        || await findLatestAttempt(req.user.id, test.id);

    const [questions] = await db.execute(
        `SELECT id, num, kind, stem, hint, word_limit
           FROM test_question
          WHERE test_id = ?
          ORDER BY num`,
        [test.id]
    );

    const payload = await hydrateAttempt({ section, test, attempt, questions });
    res.json({ status: 'ready', ...payload });
}));

// POST /api/atrium/schools/:schoolId/tests/:sectionId/generate
// Body: { regenerate?: boolean }
//
// Builds a controlled-output prompt from every topic in the section (label,
// objectives, session notes, status) and asks the model for a question set.
// On success the existing test (if any) is replaced and the user's previous
// in-progress attempt is wiped so the next GET starts a fresh attempt.
router.post('/schools/:schoolId/tests/:sectionId/generate', wrap(async (req, res) => {
    const section = await findSection(req.user.id, req.params.schoolId, req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const sectionContext = await buildSectionContext(section.id);

    const system = `You are an assessment author writing a section-level test for a one-on-one tutoring platform.

SECTION
  ${section.name}

TOPICS (with the learner's objectives + session notes)
${sectionContext}

TASK
  Author a test of 5–8 questions that probes understanding of THIS section.
  Mix question kinds intentionally:
    • "fr" — free-response (most questions; require explanation/synthesis)
    • "mc" — multiple choice (3–4 plausible options, exactly one correct)
    • "tf" — true / false
  Anchor each question in concrete material from the topics above. Prefer
  questions that surface gaps in the recorded session notes when possible.

OUTPUT FORMAT
  Return ONLY a single JSON object, no prose, no markdown fences:
  {
    "title": "Mid-term · <section name>",
    "questions": [
      {
        "kind": "fr",
        "stem": "Explain ...",
        "hint": "Consider ...",
        "wordLimit": 200
      },
      {
        "kind": "mc",
        "stem": "Which of the following ...",
        "hint": "Recall ...",
        "options": [
          { "label": "Option A", "isCorrect": false },
          { "label": "Option B", "isCorrect": true },
          { "label": "Option C", "isCorrect": false }
        ]
      },
      {
        "kind": "tf",
        "stem": "Statement to evaluate.",
        "hint": "Think about ...",
        "answer": true
      }
    ]
  }`;

    let assistantText;
    try {
        assistantText = await callAnthropicSync({
            req,
            system,
            messages: [{ role: 'user', content: 'Author the test now.' }],
            maxTokens: 3000,
        });
    } catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'AI call failed' });
    }

    const parsed = extractJson(assistantText);
    const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!rawQuestions || !rawQuestions.length) {
        return res.status(502).json({ error: 'Could not parse generated test' });
    }

    // Sanitise + clamp each question.
    const questions = rawQuestions
        .map((q) => {
            const kind = ['fr', 'mc', 'tf'].includes(q?.kind) ? q.kind : null;
            const stem = typeof q?.stem === 'string' ? q.stem.trim() : '';
            if (!kind || !stem) return null;
            const hint = typeof q?.hint === 'string' ? q.hint.trim().slice(0, 500) : null;
            const base = { kind, stem: stem.slice(0, 2000), hint };
            if (kind === 'fr') {
                const wl = Number(q?.wordLimit);
                base.wordLimit = Number.isFinite(wl) && wl > 0 ? Math.min(800, Math.round(wl)) : 200;
            } else if (kind === 'mc') {
                const opts = Array.isArray(q?.options) ? q.options : [];
                base.options = opts
                    .map((o) => ({
                        label: typeof o?.label === 'string' ? o.label.trim().slice(0, 500) : '',
                        isCorrect: !!o?.isCorrect,
                    }))
                    .filter((o) => o.label)
                    .slice(0, 6);
                if (base.options.length < 2) return null;
                if (!base.options.some((o) => o.isCorrect)) base.options[0].isCorrect = true;
            } else if (kind === 'tf') {
                base.answer = !!q?.answer;
            }
            return base;
        })
        .filter(Boolean)
        .slice(0, 10);

    if (!questions.length) {
        return res.status(502).json({ error: 'Generated test was empty after validation' });
    }

    const title = (typeof parsed?.title === 'string' && parsed.title.trim())
        ? parsed.title.trim().slice(0, 255)
        : `Section test · ${section.name}`;

    // Replace any existing test for this section, including all dependent
    // attempts/responses (cascade). This is what makes "Regenerate" idempotent.
    await db.execute(`DELETE FROM test WHERE section_id = ?`, [section.id]);
    const [testInsert] = await db.execute(
        `INSERT INTO test (section_id, title, total_questions, generated_at)
              VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
        [section.id, title, questions.length]
    );
    const testId = testInsert.insertId;

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const [qInsert] = await db.execute(
            `INSERT INTO test_question (test_id, num, kind, stem, hint, word_limit)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            [testId, i + 1, q.kind, q.stem, q.hint, q.kind === 'fr' ? q.wordLimit : null]
        );
        if (q.kind === 'mc') {
            for (let j = 0; j < q.options.length; j++) {
                const opt = q.options[j];
                await db.execute(
                    `INSERT INTO test_question_option (question_id, position, label, is_correct)
                          VALUES (?, ?, ?, ?)`,
                    [qInsert.insertId, j + 1, opt.label, opt.isCorrect ? 1 : 0]
                );
            }
        } else if (q.kind === 'tf') {
            // Persist the truth value as a single option for grading symmetry.
            await db.execute(
                `INSERT INTO test_question_option (question_id, position, label, is_correct)
                      VALUES (?, 1, ?, 1)`,
                [qInsert.insertId, q.answer ? 'True' : 'False']
            );
        }
    }

    res.status(201).json({
        status: 'ready',
        title,
        totalQuestions: questions.length,
    });
}));

// PUT /api/atrium/schools/:schoolId/tests/:sectionId/responses/:questionNum
// Body: { response }
// Autosave for the free-response textarea (and the answer for mc/tf).
router.put('/schools/:schoolId/tests/:sectionId/responses/:questionNum', wrap(async (req, res) => {
    const { response = '' } = req.body;
    const section = await findSection(req.user.id, req.params.schoolId, req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const [tests] = await db.execute(`SELECT id FROM test WHERE section_id = ?`, [section.id]);
    const test = tests[0];
    if (!test) return res.status(404).json({ error: 'No test for this section' });

    const [questions] = await db.execute(
        `SELECT id FROM test_question WHERE test_id = ? AND num = ?`,
        [test.id, req.params.questionNum]
    );
    const question = questions[0];
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const attempt = await findOrCreateActiveAttempt(req.user.id, test.id);
    const wordCount = String(response).trim().split(/\s+/).filter(Boolean).length;
    const status = response.trim() ? 'answered' : 'open';

    await db.execute(
        `INSERT INTO test_response
                (attempt_id, question_id, status, response_text, word_count)
              VALUES (?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                status = VALUES(status),
                response_text = VALUES(response_text),
                word_count = VALUES(word_count)`,
        [attempt.id, question.id, status, response, wordCount]
    );

    res.json({ status, wordCount });
}));

// PATCH /api/atrium/schools/:schoolId/tests/:sectionId/responses/:questionNum/flag
// Body: { flagged: boolean }
router.patch('/schools/:schoolId/tests/:sectionId/responses/:questionNum/flag', wrap(async (req, res) => {
    const flagged = !!req.body.flagged;
    const section = await findSection(req.user.id, req.params.schoolId, req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const [tests] = await db.execute(`SELECT id FROM test WHERE section_id = ?`, [section.id]);
    const test = tests[0];
    if (!test) return res.status(404).json({ error: 'No test for this section' });

    const [questions] = await db.execute(
        `SELECT id FROM test_question WHERE test_id = ? AND num = ?`,
        [test.id, req.params.questionNum]
    );
    const question = questions[0];
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const attempt = await findOrCreateActiveAttempt(req.user.id, test.id);
    const status = flagged ? 'flagged' : 'open';
    await db.execute(
        `INSERT INTO test_response (attempt_id, question_id, status)
              VALUES (?, ?, ?)
              ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [attempt.id, question.id, status]
    );
    res.json({ status });
}));

// PATCH /api/atrium/schools/:schoolId/tests/:sectionId/current
// Body: { questionNum }
router.patch('/schools/:schoolId/tests/:sectionId/current', wrap(async (req, res) => {
    const num = parseInt(req.body.questionNum, 10);
    if (Number.isNaN(num)) return res.status(400).json({ error: 'questionNum required' });

    const section = await findSection(req.user.id, req.params.schoolId, req.params.sectionId);
    if (!section) return res.status(404).json({ error: 'Section not found' });

    const [tests] = await db.execute(`SELECT id FROM test WHERE section_id = ?`, [section.id]);
    const test = tests[0];
    if (!test) return res.status(404).json({ error: 'No test for this section' });

    const attempt = await findOrCreateActiveAttempt(req.user.id, test.id);
    await db.execute(
        `UPDATE test_attempt SET current_question = ? WHERE id = ?`,
        [num, attempt.id]
    );
    res.json({ current: num });
}));

// POST /api/atrium/schools/:schoolId/tests/:sectionId/retake
// Marks any existing in-progress attempt as discarded and starts a fresh
// attempt. Returns the new (empty) attempt payload.
router.post('/schools/:schoolId/tests/:sectionId/retake', wrap(async (req, res) => {
    const ctx = await findSectionTest(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });
    const { section, test } = ctx;
    if (!test) return res.status(404).json({ error: 'No test for this section' });

    // Hard delete any in-progress attempt; submitted attempts stay as history.
    await db.execute(
        `DELETE FROM test_attempt
              WHERE test_id = ? AND user_id = ? AND submitted_at IS NULL`,
        [test.id, req.user.id]
    );
    const attempt = await findOrCreateActiveAttempt(req.user.id, test.id);

    const [questions] = await db.execute(
        `SELECT id, num, kind, stem, hint, word_limit
           FROM test_question
          WHERE test_id = ?
          ORDER BY num`,
        [test.id]
    );

    const payload = await hydrateAttempt({ section, test, attempt, questions });
    res.json({ status: 'ready', ...payload });
}));

// POST /api/atrium/schools/:schoolId/tests/:sectionId/submit
// Marks the attempt as submitted, then runs the grader AI synchronously,
// persisting per-question feedback + a summary on the attempt. Returns the
// fully-hydrated post-grade payload.
router.post('/schools/:schoolId/tests/:sectionId/submit', wrap(async (req, res) => {
    const ctx = await findSectionTest(req);
    if (ctx.error) return res.status(ctx.error.status).json({ error: ctx.error.message });
    const { section, test } = ctx;
    if (!test) return res.status(404).json({ error: 'No test for this section' });

    const attempt = await findOrCreateActiveAttempt(req.user.id, test.id);

    // 1) Stamp submitted_at first so the user's responses become read-only
    //    even if the grader call later fails. Re-grading will just retry.
    if (!attempt.submitted_at) {
        await db.execute(
            `UPDATE test_attempt SET submitted_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [attempt.id]
        );
    }

    const [questions] = await db.execute(
        `SELECT id, num, kind, stem, hint, word_limit
           FROM test_question
          WHERE test_id = ?
          ORDER BY num`,
        [test.id]
    );
    const [responses] = await db.execute(
        `SELECT question_id, status, response_text, word_count
           FROM test_response
          WHERE attempt_id = ?`,
        [attempt.id]
    );
    const respByQ = new Map(responses.map((r) => [r.question_id, r]));
    const [allOptions] = questions.length ? await db.execute(
        `SELECT question_id, position, label, is_correct
           FROM test_question_option
          WHERE question_id IN (${questions.map(() => '?').join(',')})
          ORDER BY question_id, position`,
        questions.map((q) => q.id)
    ) : [[]];
    const optsByQ = new Map();
    for (const o of allOptions) {
        if (!optsByQ.has(o.question_id)) optsByQ.set(o.question_id, []);
        optsByQ.get(o.question_id).push(o);
    }

    const sectionContext = await buildSectionContext(section.id);

    // Build a compact bundle the grader can reason over.
    const gradingPayload = questions.map((q) => {
        const r = respByQ.get(q.id);
        const opts = optsByQ.get(q.id) || [];
        return {
            num: q.num,
            kind: q.kind,
            stem: q.stem,
            response: r?.response_text || '',
            ...(q.kind === 'mc'
                ? { options: opts.map((o) => ({ label: o.label, isCorrect: !!o.is_correct })) }
                : {}),
            ...(q.kind === 'tf'
                ? { correctAnswer: opts[0]?.label === 'True' }
                : {}),
        };
    });

    const system = `You are an assessment grader. The learner just completed a section test.

SECTION
  ${section.name}

TOPICS (with the learner's objectives + session notes from prior tutoring)
${sectionContext}

GRADING TASK
  For every question, evaluate the learner's response:
    • "fr": grade on accuracy + depth + clarity. Award partial credit (0–100).
    • "mc": exact match against the option marked isCorrect.
    • "tf": exact match against correctAnswer.
  Provide a short, specific feedback line per question (≤ 240 chars).
  Then write a 2–3 sentence overall summary calling out strengths + gaps.
  Compute scorePct as the rounded average of per-question scorePct values.

OUTPUT FORMAT
  Return ONLY a single JSON object, no prose, no markdown fences:
  {
    "scorePct": 0-100,
    "summary": "...",
    "questions": [
      { "num": 1, "scorePct": 0-100, "isCorrect": true|false, "feedback": "..." }
    ]
  }`;

    let graderText;
    try {
        graderText = await callAnthropicSync({
            req,
            system,
            messages: [{
                role: 'user',
                content: `Grade this attempt:\n\n${JSON.stringify(gradingPayload, null, 2)}`,
            }],
            maxTokens: 3000,
        });
    } catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'Grader AI failed' });
    }

    const parsed = extractJson(graderText);
    const gradedQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const overallPct = Math.max(0, Math.min(100, Math.round(Number(parsed?.scorePct) || 0)));
    const summary = typeof parsed?.summary === 'string'
        ? parsed.summary.trim().slice(0, 2000)
        : '';

    // Upsert per-question grading rows, then stamp the attempt.
    const numToQ = new Map(questions.map((q) => [q.num, q]));
    for (const g of gradedQuestions) {
        const q = numToQ.get(Number(g?.num));
        if (!q) continue;
        const score = Math.max(0, Math.min(100, Math.round(Number(g?.scorePct) || 0)));
        const isCorrect = g?.isCorrect === true ? 1 : g?.isCorrect === false ? 0 : null;
        const fb = typeof g?.feedback === 'string' ? g.feedback.trim().slice(0, 1000) : '';
        await db.execute(
            `INSERT INTO test_response
                    (attempt_id, question_id, status, score_pct, is_correct, feedback)
                  VALUES (?, ?, 'answered', ?, ?, ?)
                  ON DUPLICATE KEY UPDATE
                    score_pct = VALUES(score_pct),
                    is_correct = VALUES(is_correct),
                    feedback = VALUES(feedback)`,
            [attempt.id, q.id, score, isCorrect, fb]
        );
    }

    await db.execute(
        `UPDATE test_attempt
            SET score_pct = ?, grader_summary = ?, graded_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [overallPct, summary, attempt.id]
    );

    // Re-read for the hydrated payload (so the front-end can swap to the
    // results view without a follow-up GET).
    const [[fresh]] = await db.execute(
        `SELECT * FROM test_attempt WHERE id = ?`,
        [attempt.id]
    );

    // Record test session time and refresh dashboard stats.
    await db.execute(
        `INSERT INTO study_session (user_id, school_id, ended_at, duration_min)
              SELECT ?, sch.id, CURRENT_TIMESTAMP, 15
                FROM school sch
                JOIN section sec ON sec.school_id = sch.id
               WHERE sec.id = ?`,
        [req.user.id, section.id],
    );
    await recomputeUserStats(req.user.id);

    const payload = await hydrateAttempt({ section, test, attempt: fresh, questions });
    res.json({ status: 'ready', ...payload });
}));


// ════════════════════════════════════════════════════════════════════════════
// PAGE 5 · ROADMAP         (/atrium/roadmap)
// ════════════════════════════════════════════════════════════════════════════

// Hydrate a draft row into the full nested shape the Roadmap page expects.
const hydrateDraft = async (draft) => {
    const [sections] = await db.execute(
        `SELECT id, position, name, highlight
           FROM roadmap_draft_section
          WHERE draft_id = ?
          ORDER BY position`,
        [draft.id]
    );
    const sectionIds = sections.map((s) => s.id);
    let topics = [];
    if (sectionIds.length) {
        const placeholders = sectionIds.map(() => '?').join(',');
        const [rows] = await db.execute(
            `SELECT draft_section_id, position, label
               FROM roadmap_draft_topic
              WHERE draft_section_id IN (${placeholders})
              ORDER BY position`,
            sectionIds
        );
        topics = rows;
    }
    const [messages] = await db.execute(
        `SELECT who, body AS text, pin_label
           FROM roadmap_message
          WHERE draft_id = ?
          ORDER BY created_at`,
        [draft.id]
    );
    return {
        draftId: draft.id,
        title: draft.title,
        subtitle: draft.subtitle || '',
        sections: sections.map((s) => ({
            name: s.name,
            highlight: !!s.highlight,
            topics: topics
                .filter((t) => t.draft_section_id === s.id)
                .map((t) => t.label),
        })),
        chat: messages,
    };
};

// GET /api/atrium/roadmap/draft
// Returns the user's most recent in-progress draft, creating an empty one if
// none exists.
router.get('/roadmap/draft', wrap(async (req, res) => {
    const [rows] = await db.execute(
        `SELECT * FROM roadmap_draft
          WHERE user_id = ? AND status = 'drafting'
          ORDER BY updated_at DESC
          LIMIT 1`,
        [req.user.id]
    );
    let draft = rows[0];
    if (!draft) {
        const [result] = await db.execute(
            `INSERT INTO roadmap_draft (user_id, title) VALUES (?, ?)`,
            [req.user.id, 'Untitled']
        );
        const [fresh] = await db.execute(
            `SELECT * FROM roadmap_draft WHERE id = ?`,
            [result.insertId]
        );
        draft = fresh[0];
    }
    res.json(await hydrateDraft(draft));
}));

// PUT /api/atrium/roadmap/draft/:draftId
// Body: { title, subtitle, sections: [{ name, highlight?, topics: [string] }] }
// Replaces the draft's sections + topics in one shot. Used by the inline
// editor and the "Regenerate" action (after the AI proposes a new shape).
router.put('/roadmap/draft/:draftId', wrap(async (req, res) => {
    const { title, subtitle, sections = [] } = req.body;
    const draftId = parseInt(req.params.draftId, 10);

    const [check] = await db.execute(
        `SELECT id FROM roadmap_draft WHERE id = ? AND user_id = ?`,
        [draftId, req.user.id]
    );
    if (!check[0]) return res.status(404).json({ error: 'Draft not found' });

    await db.execute(
        `UPDATE roadmap_draft
            SET title = COALESCE(?, title),
                subtitle = ?
          WHERE id = ?`,
        [title || null, subtitle || null, draftId]
    );

    // Cascading delete on roadmap_draft_section will clean up old topics too.
    await db.execute(
        `DELETE FROM roadmap_draft_section WHERE draft_id = ?`,
        [draftId]
    );

    for (let i = 0; i < sections.length; i++) {
        const sec = sections[i];
        const [secResult] = await db.execute(
            `INSERT INTO roadmap_draft_section (draft_id, position, name, highlight)
                  VALUES (?, ?, ?, ?)`,
            [draftId, i + 1, sec.name, sec.highlight ? 1 : 0]
        );
        const sectionId = secResult.insertId;
        const topics = Array.isArray(sec.topics) ? sec.topics : [];
        for (let j = 0; j < topics.length; j++) {
            await db.execute(
                `INSERT INTO roadmap_draft_topic (draft_section_id, position, label)
                      VALUES (?, ?, ?)`,
                [sectionId, j + 1, topics[j]]
            );
        }
    }

    const [fresh] = await db.execute(
        `SELECT * FROM roadmap_draft WHERE id = ?`,
        [draftId]
    );
    res.json(await hydrateDraft(fresh[0]));
}));

// POST /api/atrium/roadmap/draft/:draftId/messages
// Body: { message }
// Persists the user message and returns a placeholder tutor reply.
//
// TODO (AI): replace the canned reply with a real planner call that may also
// PUT a fresh sections/topics shape via the route above.
router.post('/roadmap/draft/:draftId/messages', wrap(async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }
    const draftId = parseInt(req.params.draftId, 10);

    const [check] = await db.execute(
        `SELECT id FROM roadmap_draft WHERE id = ? AND user_id = ?`,
        [draftId, req.user.id]
    );
    if (!check[0]) return res.status(404).json({ error: 'Draft not found' });

    await db.execute(
        `INSERT INTO roadmap_message (draft_id, who, body) VALUES (?, 'me', ?)`,
        [draftId, message.trim()]
    );
    const placeholder = '…(planner reply pending — AI integration not yet wired)';
    await db.execute(
        `INSERT INTO roadmap_message (draft_id, who, body) VALUES (?, 'tutor', ?)`,
        [draftId, placeholder]
    );

    res.status(201).json({
        userMessage: { who: 'me', text: message.trim() },
        tutorMessage: { who: 'tutor', text: placeholder },
    });
}));

// POST /api/atrium/roadmap/draft/:draftId/stream
// SSE streaming reply from the planner. Persists the user message before
// streaming and the planner reply after the stream completes.
//
// The planner is instructed to emit `propose_roadmap` streamline calls so the
// front end can replace the proposed roadmap shape mid-conversation.
router.post('/roadmap/draft/:draftId/stream', wrap(async (req, res) => {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'message is required' });
    }
    const draftId = parseInt(req.params.draftId, 10);
    const [check] = await db.execute(
        `SELECT id FROM roadmap_draft WHERE id = ? AND user_id = ?`,
        [draftId, req.user.id],
    );
    if (!check[0]) return res.status(404).json({ error: 'Draft not found' });

    await db.execute(
        `INSERT INTO roadmap_message (draft_id, who, body) VALUES (?, 'me', ?)`,
        [draftId, message.trim()],
    );

    const system = `You are Magister, a curriculum planner helping the user design a personalised "school" — a self-paced course made of sections and topics.

ONBOARDING CONTEXT
  The user has already been shown these five questions before they wrote to you:
    1. What is the topic you want to learn?
    2. What is your current background with this topic?
    3. What is your goal — deep mastery, working knowledge, or something specific?
    4. Are there any sub-areas you especially want to cover or skip?
    5. How much depth do you want per module — broad survey or deep dive?

  On the user's FIRST message: immediately propose a concrete roadmap based on
  whatever they share. Do NOT ask clarifying questions first — propose, then
  refine through conversation. Use web_search to find up-to-date syllabi,
  curricula, or canonical topic structures before emitting the roadmap call.
  On follow-up turns, iterate freely and ask questions to improve the plan.

YOUR JOB
  • Turn the user's answers into a well-structured roadmap right away.
  • Aim for 3–6 sections and 3–6 topics per section.
  • Iterate as the user pushes back, skips areas, or wants more depth.
  • Use web_search to verify topic ordering, industry standards, and current
    best practices — especially for fast-moving fields.

STREAMLINE CALL — REQUIRED whenever you propose or revise the roadmap.
  Emit EXACTLY ONE call on its own line, never inside code fences:

  [[CALL:propose_roadmap]]{"title":"<school name>","subtitle":"<one-line tagline>","sections":[{"name":"<section title>","topics":["<topic 1>","<topic 2>"]}]}[[/CALL]]

  Rules:
    • The JSON must be valid (double quotes, no trailing commas).
    • Use this format the first time you propose a roadmap AND every time you
      change it. The UI replaces the visible roadmap with each call.
    • Keep your conversational reply natural — explain the rationale in prose
      around the call, not inside it.
    • Don't emit the call if the user is still scoping and you have nothing
      concrete to propose.`;

    const allowedRoles = new Set(['user', 'assistant']);
    const messages = [
        ...history
            .filter((m) => allowedRoles.has(m.role) && typeof m.content === 'string')
            .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: message.trim() },
    ];

    const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
    const assistantText = await streamAnthropic({
        req,
        res,
        system,
        messages,
        tools,
    });

    if (typeof assistantText === 'string' && assistantText.trim()) {
        await db.execute(
            `INSERT INTO roadmap_message (draft_id, who, body) VALUES (?, 'tutor', ?)`,
            [draftId, assistantText],
        );
    }
}));

// POST /api/atrium/roadmap/draft/:draftId/submit
// Promotes the draft into a real school + section + topic tree.
// → { id (slug) }
router.post('/roadmap/draft/:draftId/submit', wrap(async (req, res) => {
    const draftId = parseInt(req.params.draftId, 10);
    const [drafts] = await db.execute(
        `SELECT * FROM roadmap_draft WHERE id = ? AND user_id = ?`,
        [draftId, req.user.id]
    );
    const draft = drafts[0];
    if (!draft) return res.status(404).json({ error: 'Draft not found' });

    const hydrated = await hydrateDraft(draft);

    const slug = hydrated.title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 120) || `school-${Date.now()}`;

    const [result] = await db.execute(
        `INSERT INTO school (user_id, slug, name, tagline)
              VALUES (?, ?, ?, ?)`,
        [req.user.id, slug, hydrated.title, hydrated.subtitle || null]
    );
    const schoolId = result.insertId;

    for (let i = 0; i < hydrated.sections.length; i++) {
        const sec = hydrated.sections[i];
        const [secResult] = await db.execute(
            `INSERT INTO section (school_id, position, name) VALUES (?, ?, ?)`,
            [schoolId, i + 1, sec.name]
        );
        const sectionId = secResult.insertId;
        for (let j = 0; j < sec.topics.length; j++) {
            await db.execute(
                `INSERT INTO topic (section_id, position, num, label)
                      VALUES (?, ?, ?, ?)`,
                [sectionId, j + 1, `${i + 1}.${j + 1}`, sec.topics[j]]
            );
        }
    }

    await db.execute(
        `UPDATE roadmap_draft
            SET status = 'submitted', promoted_school_id = ?
          WHERE id = ?`,
        [schoolId, draftId]
    );

    res.status(201).json({ id: slug });
}));


module.exports = router;
