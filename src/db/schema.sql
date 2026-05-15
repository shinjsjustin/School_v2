-- ────────────────────────────────────────────────────────────────────────────
-- School_v2 · database schema
--
-- Tables are grouped by the front-end page they back. Every user-owned row
-- references admin(id) (the existing users table) via user_id. Foreign keys
-- cascade on delete so removing a user / school / section also cleans up its
-- dependent rows.
-- ────────────────────────────────────────────────────────────────────────────


-- ════════════════════════════════════════════════════════════════════════════
-- USERS  (existing — kept as-is)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS `admin` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `email` varchar(255)  NOT NULL,
  `password` varchar(255) NOT NULL,
  `access_level` tinyint unsigned NOT NULL DEFAULT '0',
  `anthropic_api_key` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_email` (`email`)
);


-- ════════════════════════════════════════════════════════════════════════════
-- PAGE 1 · DASHBOARD       (/atrium)
--   Backs the folder grid + the three header stats.
--   GET /atrium/schools  → school
--   GET /atrium/stats    → user_stats
-- ════════════════════════════════════════════════════════════════════════════

-- One row per "folder" on the dashboard. Progress is denormalised here so the
-- grid renders without joining over every section + topic.
CREATE TABLE IF NOT EXISTS `school` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `slug` varchar(120) NOT NULL,                       -- URL id, e.g. "roman-history"
  `name` varchar(255) NOT NULL,                       -- "Roman History"
  `tagline` varchar(500) DEFAULT NULL,                -- shown on School page sidebar
  `tutor_label` varchar(120) DEFAULT 'Socratic',      -- "Socratic · Latin"
  `progress_pct` tinyint unsigned NOT NULL DEFAULT 0, -- 0–100, rolled up from sections
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_slug` (`user_id`, `slug`),
  KEY `idx_user` (`user_id`),
  CONSTRAINT `fk_school_user` FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
);

-- Top-line dashboard stats per user. One row per user; updated nightly (or
-- on session end) by a job that aggregates study_session.
CREATE TABLE IF NOT EXISTS `user_stats` (
  `user_id` int unsigned NOT NULL,
  `month_hours` decimal(5,1) NOT NULL DEFAULT 0.0,    -- "42h this month"
  `streak_days` smallint unsigned NOT NULL DEFAULT 0, -- "14 day streak"
  `overall_pct` tinyint unsigned NOT NULL DEFAULT 0,  -- "47% across all"
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_stats_user` FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
);

-- Raw study sessions feed user_stats and the streak calculation.
CREATE TABLE IF NOT EXISTS `study_session` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `school_id` int unsigned DEFAULT NULL,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` timestamp NULL DEFAULT NULL,
  `duration_min` smallint unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_user_started` (`user_id`, `started_at`),
  CONSTRAINT `fk_session_user`   FOREIGN KEY (`user_id`)   REFERENCES `admin`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_session_school` FOREIGN KEY (`school_id`) REFERENCES `school` (`id`) ON DELETE SET NULL
);


-- ════════════════════════════════════════════════════════════════════════════
-- PAGE 2 · SCHOOL          (/atrium/school/:schoolId)
--   Sections of a school, each with its own topic list and section test.
--   GET /atrium/schools/:schoolId  → school + sections + topics
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `section` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `school_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,              -- ordering within the school (1, 2, …)
  `name` varchar(255) NOT NULL,                       -- "Punic Wars"
  `progress_pct` tinyint unsigned NOT NULL DEFAULT 0, -- denormalised from topics
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_school_position` (`school_id`, `position`),
  KEY `idx_school` (`school_id`),
  CONSTRAINT `fk_section_school` FOREIGN KEY (`school_id`) REFERENCES `school` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `topic` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `section_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,              -- ordering within the section
  `num` varchar(16) NOT NULL,                         -- display number, e.g. "3.2"
  `label` varchar(255) NOT NULL,                      -- "Hannibal in Italy"
  -- Lifecycle:
  --   start  → never opened by the learner
  --   active → kickoff has fired; lesson is in progress (resume on revisit)
  --   ended  → user pressed End Session before all LOs were done; resumable
  --   done   → every learning objective completed
  `status` enum('start','active','ended','done') NOT NULL DEFAULT 'start',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section_position` (`section_id`, `position`),
  KEY `idx_section` (`section_id`),
  CONSTRAINT `fk_topic_section` FOREIGN KEY (`section_id`) REFERENCES `section` (`id`) ON DELETE CASCADE
);

-- Migration note (existing installs):
--   ALTER TABLE topic
--     MODIFY status enum('start','active','ended','done') NOT NULL DEFAULT 'start';


-- ════════════════════════════════════════════════════════════════════════════
-- PAGE 3 · TEACHER         (/atrium/school/:schoolId/topic/:topicId)
--   Per-topic learning objectives, resources, and the Socratic chat thread.
--   GET  /atrium/schools/:schoolId/topics/:topicId  → objectives + resources + messages
--   POST /atrium/chat                               → topic_message (who='me' then 'tutor')
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `topic_objective` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `topic_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,
  `text` varchar(500) NOT NULL,
  `state` enum('todo','current','done') NOT NULL DEFAULT 'todo',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_topic_position` (`topic_id`, `position`),
  CONSTRAINT `fk_objective_topic` FOREIGN KEY (`topic_id`) REFERENCES `topic` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `topic_resource` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `topic_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,
  `label` varchar(255) NOT NULL,                      -- "Livy, Book XXII (excerpt)"
  `url` varchar(1000) DEFAULT NULL,                   -- external/PDF link
  PRIMARY KEY (`id`),
  KEY `idx_topic` (`topic_id`),
  CONSTRAINT `fk_resource_topic` FOREIGN KEY (`topic_id`) REFERENCES `topic` (`id`) ON DELETE CASCADE
);

-- One row per chat bubble. `who` matches the front-end ('tutor' | 'me').
-- A topic chat is per-user-per-topic; user_id lets multiple users share a
-- school definition but keep their own conversation.
CREATE TABLE IF NOT EXISTS `topic_message` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `topic_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `who` enum('tutor','me') NOT NULL,
  `body` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_topic_user_time` (`topic_id`, `user_id`, `created_at`),
  CONSTRAINT `fk_msg_topic` FOREIGN KEY (`topic_id`) REFERENCES `topic` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_user`  FOREIGN KEY (`user_id`)  REFERENCES `admin` (`id`) ON DELETE CASCADE
);

-- Tutor-emitted session notes from `update_progress` streamline calls. One
-- row per note; the tutor decides when a milestone is worth recording. Shown
-- under "Session notes" in the LO sidebar so the user can scan their own
-- progress at a glance.
CREATE TABLE IF NOT EXISTS `topic_session_note` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `topic_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `note` varchar(1000) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_topic_user_time` (`topic_id`, `user_id`, `created_at`),
  CONSTRAINT `fk_note_topic` FOREIGN KEY (`topic_id`) REFERENCES `topic` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_note_user`  FOREIGN KEY (`user_id`)  REFERENCES `admin` (`id`) ON DELETE CASCADE
);


-- ════════════════════════════════════════════════════════════════════════════
-- PAGE 4 · TEST            (/atrium/school/:schoolId/test/:sectionId)
--   A test is owned by a section. Each user gets an attempt with per-question
--   responses (autosaved as the textarea is edited).
--   GET   /atrium/tests/:sectionId                              → test + questions + attempt
--   PUT   /atrium/tests/:sectionId/responses/:questionNum       → autosave
--   PATCH /atrium/tests/:sectionId/responses/:questionNum/flag  → toggle flag
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `test` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `section_id` int unsigned NOT NULL,
  `title` varchar(255) NOT NULL,                      -- "Mid-term · Punic Wars"
  `total_questions` smallint unsigned NOT NULL DEFAULT 0,
  `generated_at` timestamp NULL DEFAULT NULL,         -- last successful AI generation
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_section` (`section_id`),
  CONSTRAINT `fk_test_section` FOREIGN KEY (`section_id`) REFERENCES `section` (`id`) ON DELETE CASCADE
);

-- Migration note (existing installs):
--   ALTER TABLE test ADD COLUMN generated_at TIMESTAMP NULL DEFAULT NULL AFTER total_questions;

CREATE TABLE IF NOT EXISTS `test_question` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `test_id` int unsigned NOT NULL,
  `num` smallint unsigned NOT NULL,                   -- 1-based number shown in UI
  `kind` enum('mc','tf','fr') NOT NULL,               -- multiple choice / true-false / free response
  `stem` text NOT NULL,
  `hint` text DEFAULT NULL,
  `word_limit` smallint unsigned DEFAULT NULL,        -- only meaningful for `fr`
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_test_num` (`test_id`, `num`),
  CONSTRAINT `fk_question_test` FOREIGN KEY (`test_id`) REFERENCES `test` (`id`) ON DELETE CASCADE
);

-- Multiple-choice options. Empty for `tf` and `fr` questions.
CREATE TABLE IF NOT EXISTS `test_question_option` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `question_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,
  `label` varchar(500) NOT NULL,
  `is_correct` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_question_position` (`question_id`, `position`),
  CONSTRAINT `fk_option_question` FOREIGN KEY (`question_id`) REFERENCES `test_question` (`id`) ON DELETE CASCADE
);

-- Many attempts allowed per (user, test). The latest unsubmitted row is the
-- "in-progress" attempt for the user; submitted rows form a history.
CREATE TABLE IF NOT EXISTS `test_attempt` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `test_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `current_question` smallint unsigned NOT NULL DEFAULT 1,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `score_pct` tinyint unsigned DEFAULT NULL,
  `graded_at` timestamp NULL DEFAULT NULL,            -- when grader AI finished
  `grader_summary` text DEFAULT NULL,                 -- overall feedback paragraph
  PRIMARY KEY (`id`),
  KEY `idx_test_user` (`test_id`, `user_id`),
  CONSTRAINT `fk_attempt_test` FOREIGN KEY (`test_id`) REFERENCES `test`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attempt_user` FOREIGN KEY (`user_id`) REFERENCES `admin` (`id`) ON DELETE CASCADE
);

-- Migration note (existing installs):
--   ALTER TABLE test_attempt
--     DROP INDEX uq_test_user,
--     ADD INDEX  idx_test_user (test_id, user_id),
--     ADD COLUMN graded_at      TIMESTAMP NULL DEFAULT NULL AFTER score_pct,
--     ADD COLUMN grader_summary TEXT      DEFAULT NULL      AFTER graded_at;

-- One row per (attempt, question). `status` matches the front-end legend.
-- Free-response answers go in `response_text`; MC choice goes in `option_id`.
CREATE TABLE IF NOT EXISTS `test_response` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `attempt_id` int unsigned NOT NULL,
  `question_id` int unsigned NOT NULL,
  `status` enum('open','current','answered','flagged') NOT NULL DEFAULT 'open',
  `option_id` int unsigned DEFAULT NULL,              -- mc / tf
  `tf_value` tinyint(1) DEFAULT NULL,                 -- tf shortcut (0 / 1)
  `response_text` text DEFAULT NULL,                  -- fr autosave target
  `word_count` smallint unsigned NOT NULL DEFAULT 0,
  `score_pct` tinyint unsigned DEFAULT NULL,          -- grader output: 0–100
  `is_correct` tinyint(1) DEFAULT NULL,               -- grader output: 0 / 1
  `feedback` text DEFAULT NULL,                       -- grader's per-question note
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attempt_question` (`attempt_id`, `question_id`),
  CONSTRAINT `fk_response_attempt`  FOREIGN KEY (`attempt_id`)  REFERENCES `test_attempt`         (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_response_question` FOREIGN KEY (`question_id`) REFERENCES `test_question`        (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_response_option`   FOREIGN KEY (`option_id`)   REFERENCES `test_question_option` (`id`) ON DELETE SET NULL
);

-- Migration note (existing installs):
--   ALTER TABLE test_response
--     ADD COLUMN score_pct  TINYINT UNSIGNED DEFAULT NULL AFTER word_count,
--     ADD COLUMN is_correct TINYINT(1)       DEFAULT NULL AFTER score_pct,
--     ADD COLUMN feedback   TEXT             DEFAULT NULL AFTER is_correct;


-- ════════════════════════════════════════════════════════════════════════════
-- PAGE 5 · ROADMAP         (/atrium/roadmap)
--   The "what do you want to learn" planning chat. The user iterates on a
--   draft roadmap until they hit "Create school", at which point the draft
--   is materialised into school + section + topic rows.
--   GET  /atrium/roadmap/draft        → roadmap_draft + roadmap_draft_section + roadmap_draft_topic
--   POST /atrium/roadmap/chat         → roadmap_message
--   POST /atrium/roadmap/regenerate   → rewrites the draft sections/topics
--   POST /atrium/schools              → promotes draft into school + cascade
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `roadmap_draft` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int unsigned NOT NULL,
  `title` varchar(255) NOT NULL DEFAULT 'Untitled',   -- "Roman History"
  `subtitle` varchar(500) DEFAULT NULL,
  `status` enum('drafting','submitted','discarded') NOT NULL DEFAULT 'drafting',
  `promoted_school_id` int unsigned DEFAULT NULL,     -- set when 'submitted'
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_draft_user`   FOREIGN KEY (`user_id`)            REFERENCES `admin`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_draft_school` FOREIGN KEY (`promoted_school_id`) REFERENCES `school` (`id`) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS `roadmap_draft_section` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `draft_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `highlight` tinyint(1) NOT NULL DEFAULT 0,          -- shown with the accent border
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_draft_position` (`draft_id`, `position`),
  CONSTRAINT `fk_dsection_draft` FOREIGN KEY (`draft_id`) REFERENCES `roadmap_draft` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `roadmap_draft_topic` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `draft_section_id` int unsigned NOT NULL,
  `position` smallint unsigned NOT NULL,
  `label` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dsection_position` (`draft_section_id`, `position`),
  CONSTRAINT `fk_dtopic_section` FOREIGN KEY (`draft_section_id`) REFERENCES `roadmap_draft_section` (`id`) ON DELETE CASCADE
);

-- Planning-mode chat (parallel to topic_message but scoped to a draft).
CREATE TABLE IF NOT EXISTS `roadmap_message` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `draft_id` int unsigned NOT NULL,
  `who` enum('tutor','me') NOT NULL,
  `body` text NOT NULL,
  `pin_label` varchar(255) DEFAULT NULL,              -- "Roman History · 4 sections, 15 topics"
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_draft_time` (`draft_id`, `created_at`),
  CONSTRAINT `fk_rmsg_draft` FOREIGN KEY (`draft_id`) REFERENCES `roadmap_draft` (`id`) ON DELETE CASCADE
);
