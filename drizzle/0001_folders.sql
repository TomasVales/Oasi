CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`emoji` text DEFAULT '📁' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folders_subject_idx` ON `folders` (`subject_id`);--> statement-breakpoint
CREATE INDEX `folders_parent_idx` ON `folders` (`parent_id`);--> statement-breakpoint
ALTER TABLE `documents` ADD `folder_id` text REFERENCES folders(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `notes` ADD `folder_id` text REFERENCES folders(id) ON DELETE set null;