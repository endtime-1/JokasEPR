-- The AI Assistant stored chat messages in a plain `String` column, which
-- Prisma maps to VARCHAR(191) on MySQL/MariaDB. On Hostinger's lenient
-- MariaDB this silently truncated every AI reply to ~191 chars; the VPS
-- MariaDB runs in strict mode and rejects the insert outright (error 1265),
-- so every AI chat 500'd. Widen to LONGTEXT (and the session title to 300).

ALTER TABLE `AiChatMessage` MODIFY `content` LONGTEXT NOT NULL;
ALTER TABLE `AiChatSession` MODIFY `title` VARCHAR(300) NULL;
