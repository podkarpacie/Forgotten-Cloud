ALTER TABLE `server_instances` ADD `backup_cron_task_uid` varchar(65);--> statement-breakpoint
ALTER TABLE `server_instances` ADD `backup_cron` varchar(64);--> statement-breakpoint
ALTER TABLE `server_instances` ADD `backup_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `server_instances` ADD CONSTRAINT `server_instances_backup_cron_task_uid_unique` UNIQUE(`backup_cron_task_uid`);