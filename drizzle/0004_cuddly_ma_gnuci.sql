CREATE TABLE `sale_voids` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`reason` text NOT NULL,
	`voided_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action
);
