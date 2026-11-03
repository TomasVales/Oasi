CREATE TABLE `check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`energy` text NOT NULL,
	`urgent_subject_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`urgent_subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `check_ins_date_idx` ON `check_ins` (`local_date`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`title` text NOT NULL,
	`original_name` text NOT NULL,
	`storage_path` text NOT NULL,
	`sha256` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`page_count` integer NOT NULL,
	`last_page` integer DEFAULT 1 NOT NULL,
	`max_page_read` integer DEFAULT 0 NOT NULL,
	`last_opened_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `documents_subject_idx` ON `documents` (`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `documents_subject_hash_uq` ON `documents` (`subject_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`starts_at` integer NOT NULL,
	`ends_at` integer,
	`all_day` integer DEFAULT false NOT NULL,
	`weight` integer DEFAULT 3 NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`completed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_starts_at_idx` ON `events` (`starts_at`);--> statement-breakpoint
CREATE INDEX `events_subject_idx` ON `events` (`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `events_external_uq` ON `events` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`document_id` text,
	`title` text DEFAULT 'Sin título' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notes_subject_idx` ON `notes` (`subject_id`);--> statement-breakpoint
CREATE INDEX `notes_document_idx` ON `notes` (`document_id`);--> statement-breakpoint
CREATE TABLE `pdf_anchors` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`note_id` text,
	`kind` text NOT NULL,
	`page` integer NOT NULL,
	`rects` text NOT NULL,
	`selected_text` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `anchors_document_idx` ON `pdf_anchors` (`document_id`);--> statement-breakpoint
CREATE INDEX `anchors_note_idx` ON `pdf_anchors` (`note_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text,
	`event_id` text,
	`document_id` text,
	`check_in_id` text,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`local_date` text NOT NULL,
	`planned_seconds` integer,
	`active_seconds` integer DEFAULT 0 NOT NULL,
	`focus_score` real,
	`pages_from` integer,
	`pages_to` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`check_in_id`) REFERENCES `check_ins`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sessions_local_date_idx` ON `study_sessions` (`local_date`);--> statement-breakpoint
CREATE INDEX `sessions_subject_idx` ON `study_sessions` (`subject_id`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`difficulty` integer DEFAULT 3 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
