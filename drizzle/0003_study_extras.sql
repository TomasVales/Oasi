CREATE TABLE `flashcard_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`note_id` text NOT NULL,
	`ease` real DEFAULT 2.5 NOT NULL,
	`interval_days` real DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`last_reviewed_at` integer,
	FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `flashcards_note_idx` ON `flashcard_reviews` (`note_id`);--> statement-breakpoint
CREATE INDEX `flashcards_due_idx` ON `flashcard_reviews` (`due_at`);--> statement-breakpoint
ALTER TABLE `study_sessions` ADD `source` text DEFAULT 'timer' NOT NULL;--> statement-breakpoint
ALTER TABLE `subjects` ADD `weekly_goal_minutes` integer;