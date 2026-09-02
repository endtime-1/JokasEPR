-- Mash vs Concentrate for finished feed products. Null for everything else.
ALTER TABLE `Product`
  ADD COLUMN `feedForm` ENUM('MASH', 'CONCENTRATE') NULL;
