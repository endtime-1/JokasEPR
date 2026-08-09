-- M2: QuickBooks documents at-least-once (occasionally duplicate) webhook
-- delivery, and nothing previously deduped before recording a new event.
-- A redelivery of the same change carries the same lastUpdated (eventDate);
-- a genuinely new change to the same entity does not.
CREATE UNIQUE INDEX `qb_webhook_event_dedup_key` ON `QuickBooksWebhookEvent`(`realmId`, `entityType`, `entityId`, `eventDate`);
