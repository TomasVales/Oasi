CREATE TABLE `plan_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`local_date` text NOT NULL,
	`reason` text NOT NULL,
	`energy` text NOT NULL,
	`urgent_subject_id` text,
	`blocks` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plan_snapshots_date_idx` ON `plan_snapshots` (`local_date`);