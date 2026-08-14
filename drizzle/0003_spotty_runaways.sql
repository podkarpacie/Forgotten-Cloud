CREATE TABLE `server_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`server_id` int NOT NULL,
	`label` varchar(80) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`last_seen_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `server_agents_id` PRIMARY KEY(`id`),
	CONSTRAINT `server_agents_server_id_unique` UNIQUE(`server_id`),
	CONSTRAINT `server_agents_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `server_agents` ADD CONSTRAINT `server_agents_server_id_server_instances_id_fk` FOREIGN KEY (`server_id`) REFERENCES `server_instances`(`id`) ON DELETE no action ON UPDATE no action;