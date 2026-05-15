// ────────────────────────────────────────────────────────────────────────────
// Atrium · API client
//
// Thin wrapper around fetch that:
//   • prefixes every request with REACT_APP_URL (the backend root)
//   • attaches the JWT Bearer token from localStorage
//   • parses JSON and surfaces a consistent { ok, data, error } shape
//
// Every helper corresponds 1:1 with a route in src/routes/atrium.js.
// ────────────────────────────────────────────────────────────────────────────

const base = () => process.env.REACT_APP_URL;

const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
});

const request = async (method, path, body) => {
    const res = await fetch(`${base()}${path}`, {
        method,
        headers: authHeaders(),
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return { ok: true, data: null };
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        return { ok: false, status: res.status, error: data?.error || res.statusText };
    }
    return { ok: true, data };
};

// ── Dashboard ───────────────────────────────────────────────────────────────
export const fetchSchools = () => request('GET', '/atrium/schools');
export const fetchStats = () => request('GET', '/atrium/stats');

// ── School ──────────────────────────────────────────────────────────────────
export const fetchSchool = (schoolId) =>
    request('GET', `/atrium/schools/${encodeURIComponent(schoolId)}`);
export const createSchool = (payload) => request('POST', '/atrium/schools', payload);
export const deleteSchool = (schoolId) =>
    request('DELETE', `/atrium/schools/${encodeURIComponent(schoolId)}`);

// ── Teacher ─────────────────────────────────────────────────────────────────
export const fetchTopic = (schoolId, topicId) =>
    request(
        'GET',
        `/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}`,
    );
export const sendTopicMessage = (schoolId, topicId, message) =>
    request(
        'POST',
        `/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}/messages`,
        { message },
    );
export const updateObjective = (objectiveId, state) =>
    request('PATCH', `/atrium/objectives/${objectiveId}`, { state });
export const addTopicNote = (schoolId, topicId, note) =>
    request(
        'POST',
        `/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}/notes`,
        { note },
    );

// ── Test ────────────────────────────────────────────────────────────────────
export const fetchTest = (schoolId, sectionId) =>
    request(
        'GET',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}`,
    );
export const generateTest = (schoolId, sectionId) =>
    request(
        'POST',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}/generate`,
    );
export const retakeTest = (schoolId, sectionId) =>
    request(
        'POST',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}/retake`,
    );
export const saveResponse = (schoolId, sectionId, questionNum, response) =>
    request(
        'PUT',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}/responses/${questionNum}`,
        { response },
    );
export const flagResponse = (schoolId, sectionId, questionNum, flagged) =>
    request(
        'PATCH',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}/responses/${questionNum}/flag`,
        { flagged },
    );
export const setCurrentQuestion = (schoolId, sectionId, questionNum) =>
    request(
        'PATCH',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}/current`,
        { questionNum },
    );
export const submitTest = (schoolId, sectionId) =>
    request(
        'POST',
        `/atrium/schools/${encodeURIComponent(schoolId)}/tests/${encodeURIComponent(sectionId)}/submit`,
    );

// ── Roadmap ─────────────────────────────────────────────────────────────────
export const fetchRoadmapDraft = () => request('GET', '/atrium/roadmap/draft');
export const updateRoadmapDraft = (draftId, payload) =>
    request('PUT', `/atrium/roadmap/draft/${draftId}`, payload);
export const sendRoadmapMessage = (draftId, message) =>
    request('POST', `/atrium/roadmap/draft/${draftId}/messages`, { message });
export const submitRoadmapDraft = (draftId) =>
    request('POST', `/atrium/roadmap/draft/${draftId}/submit`);

// ── Streaming endpoint URLs (used directly by useChatStream) ────────────────
export const roadmapStreamUrl = (draftId) =>
    `${base()}/atrium/roadmap/draft/${draftId}/stream`;
export const teacherStreamUrl = (schoolId, topicId) =>
    `${base()}/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}/stream`;
export const teacherObjectivesGenerateUrl = (schoolId, topicId) =>
    `${base()}/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}/objectives/generate`;
export const teacherEndSessionUrl = (schoolId, topicId) =>
    `${base()}/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}/end-session/stream`;
export const teacherHintUrl = (schoolId, topicId) =>
    `${base()}/atrium/schools/${encodeURIComponent(schoolId)}/topics/${encodeURIComponent(topicId)}/hint/stream`;
