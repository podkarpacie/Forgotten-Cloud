CREATE TABLE `membership_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`membership_id` int NOT NULL,
	`permission` enum('console','players','plugins','scripts','database','backups','settings') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	CONSTRAINT `membership_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `membership_permission_unique` UNIQUE(`membership_id`,`permission`)
);
--> statement-breakpoint
CREATE TABLE `plugin_installs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`plugin_slug` varchar(64) NOT NULL,
	`plugin_name` varchar(120) NOT NULL,
	`engine_version` varchar(24) NOT NULL,
	`installed_by` int NOT NULL,
	`installed_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `plugin_installs_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_plugin_unique` UNIQUE(`server_id`,`plugin_slug`)
);
--> statement-breakpoint
CREATE TABLE `public_listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`description` varchar(240),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `public_listings_id` PRIMARY KEY(`id`),
	CONSTRAINT `public_listing_server_unique` UNIQUE(`server_id`)
);
--> statement-breakpoint
CREATE TABLE `server_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`created_by` int,
	`backup_type` enum('automatic','manual') NOT NULL,
	`restore_state` enum('ready','requested','restored','failed') NOT NULL DEFAULT 'ready',
	`manifest` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_backups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`actor_user_id` int,
	`kind` enum('lifecycle','command','info','warning','backup','restore') NOT NULL,
	`message` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `server_instances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`uuid` varchar(48) NOT NULL,
	`owner_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`game_version` varchar(16) NOT NULL DEFAULT 'Tibia 8.0',
	`engine_version` varchar(24) NOT NULL DEFAULT '0.1.0',
	`map_template` enum('global_8','high_rate','hardcore','empty_world') NOT NULL,
	`experience_rate` int NOT NULL DEFAULT 1,
	`pvp_mode` enum('open','optional','hardcore') NOT NULL DEFAULT 'open',
	`database_mode` enum('automatic_sqlite','advanced_postgres','advanced_mysql') NOT NULL DEFAULT 'automatic_sqlite',
	`desired_status` enum('offline','starting','online','stopping','failed') NOT NULL DEFAULT 'offline',
	`observed_status` enum('offline','starting','online','stopping','failed') NOT NULL DEFAULT 'offline',
	`address` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_instances_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_instances_uuid_unique` UNIQUE(`uuid`)
);
--> statement-breakpoint
CREATE TABLE `server_memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('owner','developer','moderator','mapper','GM') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_member_unique` UNIQUE(`server_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `server_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`player_count` int NOT NULL DEFAULT 0,
	`player_limit` int NOT NULL DEFAULT 100,
	`uptime_seconds` int NOT NULL DEFAULT 0,
	`cpu_percent` int NOT NULL DEFAULT 0,
	`ram_mb` int NOT NULL DEFAULT 0,
	`captured_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_metrics_server_unique` UNIQUE(`server_id`)
);
--> statement-breakpoint
CREATE TABLE `server_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`created_by` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_profiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `membership_permissions` ADD CONSTRAINT `membership_permissions_membership_id_server_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `server_memberships`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plugin_installs` ADD CONSTRAINT `plugin_installs_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `plugin_installs` ADD CONSTRAINT `plugin_installs_installed_by_users_id_fk` FOREIGN KEY (`installed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `public_listings` ADD CONSTRAINT `public_listings_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_backups` ADD CONSTRAINT `server_backups_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_backups` ADD CONSTRAINT `server_backups_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_events` ADD CONSTRAINT `server_events_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_events` ADD CONSTRAINT `server_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_instances` ADD CONSTRAINT `server_instances_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_memberships` ADD CONSTRAINT `server_memberships_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_memberships` ADD CONSTRAINT `server_memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_metrics` ADD CONSTRAINT `server_metrics_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_profiles` ADD CONSTRAINT `server_profiles_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_profiles` ADD CONSTRAINT `server_profiles_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `server_backup_idx` ON `server_backups` (`server_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `server_event_idx` ON `server_events` (`server_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `server_owner_idx` ON `server_instances` (`owner_id`);--> statement-breakpoint
CREATE INDEX `server_profile_idx` ON `server_profiles` (`server_id`,`created_at`);