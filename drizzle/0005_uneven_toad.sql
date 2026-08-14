CREATE TABLE `server_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`path` varchar(512) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`size_bytes` int NOT NULL DEFAULT 0,
	`checksum` varchar(128),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_files_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_file_unique` UNIQUE(`server_id`,`path`)
);
--> statement-breakpoint
CREATE TABLE `server_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`external_id` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`online` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `server_players_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_player_unique` UNIQUE(`server_id`,`external_id`)
);
--> statement-breakpoint
ALTER TABLE `server_files` ADD CONSTRAINT `server_files_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `server_players` ADD CONSTRAINT `server_players_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;