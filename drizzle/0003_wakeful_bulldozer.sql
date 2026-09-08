ALTER TABLE `sales` ADD `payment_method` text DEFAULT 'CASH' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `discount_cents` integer DEFAULT 0 NOT NULL;