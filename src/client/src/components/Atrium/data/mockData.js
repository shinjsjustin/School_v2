// ────────────────────────────────────────────────────────────────────────────
// Atrium · mock data
//
// Every export here is placeholder data so the new screens render end-to-end.
// Replace each block with a real API call as the backend lands. The TODO
// comments mark the exact swap points.
// ────────────────────────────────────────────────────────────────────────────

// TODO: Wire to GET ${REACT_APP_URL}/atrium/schools
//       Returns the user's library: [{ id, name, progress }]
export const SCHOOLS = [
    { id: 'roman-history',          name: 'Roman History',          progress: 72 },
    { id: 'calculus-ii',            name: 'Calculus II',            progress: 45 },
    { id: 'spanish',                name: 'Conversational Spanish', progress: 88 },
    { id: 'music-theory',           name: 'Music Theory',           progress: 18 },
    { id: 'organic-chemistry',      name: 'Organic Chemistry',      progress: 31 },
    { id: 'behavioral-economics',   name: 'Behavioral Economics',   progress: 62 },
    { id: 'astrophysics',           name: 'Astrophysics',           progress: 9  },
    { id: 'classical-guitar',       name: 'Classical Guitar',       progress: 54 },
];

// TODO: Wire to GET ${REACT_APP_URL}/atrium/stats
//       Roll-up of per-user metrics for the dashboard header.
export const DASHBOARD_STATS = {
    monthHours: 42,
    streak: 14,
    overallPct: 47,
};

// TODO: Wire to GET ${REACT_APP_URL}/atrium/schools/:schoolId
//       Returns sections + topics + meta for the School page.
export const SCHOOL_DETAIL = {
    id: 'roman-history',
    name: 'Roman History',
    tagline: 'A history of Rome,\nfrom myth to empire.',
    progress: 56,
    meta: {
        tutor: 'Socratic · Latin',
        sections: 4,
        topics: 15,
        completed: 8,
        nextTest: 'Late Republic',
        resumeTopicId: '2.4',
        resumeTopicLabel: 'Conflict of the Orders',
    },
    sections: [
        {
            id: 's1',
            name: 'The Founding & Kingdom',
            progress: 100,
            topics: [
                { id: '1.1', num: '1.1', label: 'Aeneas & origin myth', status: 'done' },
                { id: '1.2', num: '1.2', label: 'Romulus and Remus',    status: 'done' },
                { id: '1.3', num: '1.3', label: 'The seven kings',      status: 'done' },
                { id: '1.4', num: '1.4', label: 'The Etruscan period',  status: 'done' },
            ],
        },
        {
            id: 's2',
            name: 'Early Republic',
            progress: 75,
            topics: [
                { id: '2.1', num: '2.1', label: 'Overthrow of the kings', status: 'done' },
                { id: '2.2', num: '2.2', label: 'Patricians & plebeians', status: 'done' },
                { id: '2.3', num: '2.3', label: 'The Twelve Tables',      status: 'done' },
                { id: '2.4', num: '2.4', label: 'Conflict of the Orders', status: 'start' },
            ],
        },
        {
            id: 's3',
            name: 'Punic Wars',
            progress: 33,
            topics: [
                { id: '3.1', num: '3.1', label: 'First Punic War',     status: 'done' },
                { id: '3.2', num: '3.2', label: 'Hannibal in Italy',   status: 'start' },
                { id: '3.3', num: '3.3', label: 'Scipio at Zama',      status: 'start' },
            ],
        },
        {
            id: 's4',
            name: 'Late Republic',
            progress: 0,
            topics: [
                { id: '4.1', num: '4.1', label: 'Gracchi reforms',                status: 'start' },
                { id: '4.2', num: '4.2', label: 'Marius & Sulla',                 status: 'start' },
                { id: '4.3', num: '4.3', label: 'First Triumvirate',              status: 'start' },
                { id: '4.4', num: '4.4', label: 'Caesar crosses the Rubicon',     status: 'start' },
            ],
        },
    ],
};

// TODO: Wire to GET ${REACT_APP_URL}/atrium/schools/:schoolId/topics/:topicId
//       Returns objectives + the chat history for this topic.
export const TOPIC_DETAIL = {
    section: 'Punic Wars',
    topic: 'Hannibal in Italy',
    progress: 42,
    objectives: [
        { text: 'Identify the strategic causes of the Second Punic War', state: 'done' },
        { text: "Trace Hannibal's route from Iberia into Italy",         state: 'done' },
        { text: 'Explain the Roman response after Cannae',               state: 'current' },
        { text: 'Analyze why Hannibal never marched on Rome',            state: 'todo' },
        { text: 'Connect this war to the shift toward provincial empire', state: 'todo' },
    ],
    resources: [
        { label: 'Livy, Book XXII (excerpt)' },
        { label: "Map: Hannibal's Italian campaign" },
        { label: 'Lecture notes (PDF)' },
    ],
    messages: [
        { who: 'tutor', text: 'So — Cannae, 216 BC. Hannibal has just annihilated the largest army Rome has ever fielded. If you were in the Senate the next morning, what would your gut reaction be?' },
        { who: 'me',    text: 'Sue for peace, surely. They lost something like 50,000 men in a day.' },
        { who: 'tutor', text: 'A reasonable instinct, and one many ancient sources tell us Hannibal expected. But Rome refused even to ransom her prisoners. Why might a city respond *more* defiantly to a catastrophic defeat than to a small one?' },
        { who: 'me',    text: 'Because giving up now would mean those deaths were for nothing?' },
        { who: 'tutor', text: 'Yes — sunk cost is part of it. There is also something structural about how the Republic was organized. Think about who serves in the army, and who in the Senate. What changes after a defeat this large?' },
    ],
    draftReply: "The soldiers and farmers are the same people, so a defeat in the field shows up in the Senate's families…",
};

// TODO: Wire to GET ${REACT_APP_URL}/atrium/tests/:sectionId
//       Returns the section's test + the user's saved progress.
export const TEST_DETAIL = {
    section: 'Punic Wars',
    current: 4,
    total: 8,
    questions: [
        { num: 1, kind: 'mc',  status: 'answered', stem: 'Which treaty ended the First Punic War?' },
        { num: 2, kind: 'tf',  status: 'answered', stem: 'Hannibal crossed the Alps in winter.' },
        { num: 3, kind: 'mc',  status: 'answered', stem: 'Where was the battle of Cannae fought?' },
        { num: 4, kind: 'fr',  status: 'current',  stem: 'Why did Rome refuse to negotiate after Cannae?' },
        { num: 5, kind: 'mc',  status: 'flagged',  stem: 'Who commanded Roman forces at Zama?' },
        { num: 6, kind: 'tf',  status: 'open',     stem: 'Carthage was destroyed in 146 BC.' },
        { num: 7, kind: 'mc',  status: 'open',     stem: 'What was a fabian strategy?' },
        { num: 8, kind: 'fr',  status: 'open',     stem: "Did the Punic Wars cause Rome's shift to empire?" },
    ],
    currentQuestion: {
        num: 4,
        kind: 'fr',
        stem: 'Why did Rome refuse to negotiate after the catastrophe at Cannae?',
        hint: "Think about the social structure of the Republic — who fought in the legions, and who voted in the Senate. The two groups overlap in a way that doesn't quite hold in a modern state.",
        draftResponse:
            "Because the Republic's political class and its armies were drawn from the same families — every senator had skin in the game. A negotiated peace would have ratified the loss of those sons rather than redeem it. Refusing to talk also let Rome reset the conflict's terms, drawing on its much deeper manpower reserves to wear Hannibal down.",
        wordCount: 218,
        wordLimit: 500,
        autoSavedSec: 12,
    },
};

export const KIND_LABEL = { mc: 'Multiple choice', tf: 'True / False', fr: 'Free response' };

// TODO: Wire to POST ${REACT_APP_URL}/atrium/roadmap/draft  → returns ROADMAP_DRAFT
//       Wire to POST ${REACT_APP_URL}/atrium/schools         → creates the school
//                    body: { title, subtitle, sections }
export const ROADMAP_CHAT = [
    { who: 'tutor', text: "What do you want to learn? Tell me as concretely or as fuzzily as you like — \"I want to read Cicero in the original\" works just as well as \"something about ancient Rome.\"" },
    { who: 'me',    text: "I want to actually understand the Roman Republic — not memorize emperors, but follow how a city became an empire and then ate itself. I have maybe an hour a day." },
    { who: 'tutor', text: "Good — that's a story arc, not a fact list. I'll structure it that way: four sections, fifteen topics, ~6 weeks at an hour a day. Take a look on the left and edit anything that doesn't fit — change a section title, drop a topic, add one you care about. Once it looks right, submit it and I'll spin up the school." },
    { who: 'me',    text: "Can we go a little deeper on the Punic Wars? That's the part I keep getting fuzzy on." },
];

export const ROADMAP_DRAFT = {
    title: 'Roman History',
    subtitle: 'From founding myth to the fall of the Republic',
    sections: [
        {
            name: 'The Founding & Kingdom',
            topics: ['Aeneas & origin myth', 'Romulus and Remus', 'The seven kings', 'The Etruscan period'],
        },
        {
            name: 'Early Republic',
            topics: ['Overthrow of the kings', 'Patricians & plebeians', 'The Twelve Tables', 'Conflict of the Orders'],
        },
        {
            name: 'Punic Wars',
            topics: ['First Punic War', 'Hannibal in Italy', 'Scipio at Zama', 'Destruction of Carthage'],
            highlight: true,
        },
        {
            name: 'Late Republic',
            topics: ['Gracchi reforms', 'Marius & Sulla', 'First Triumvirate', 'Caesar crosses the Rubicon'],
        },
    ],
};
