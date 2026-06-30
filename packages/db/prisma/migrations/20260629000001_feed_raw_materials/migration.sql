-- Add missing feed mill raw material ingredients
-- Existing: Oyster Shell, Dicalcium Phosphate, Salt, Lysine, Methionine, Broiler Premix, Soybean Meal, Whole Yellow Maize
-- Adding the remaining ingredients from the feed mill ingredient list
--
-- Wrapped in DO block: silently skips on fresh production databases where the
-- seeded company ID does not yet exist. Run prisma:seed after first deploy to
-- populate the full product catalogue.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Company" WHERE id = '23ed4040-f5a1-42ad-b4f4-690dc1640112') THEN
    INSERT INTO "Product" (id, "companyId", "uomId", name, sku, type, status, "createdAt", "updatedAt")
    VALUES
      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Achieve (Enzyme Supplement)', 'RM-ACHIEVE', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Larvex', 'RM-LARVEX', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Vitamin Premix', 'RM-VPREMIX', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Feed Binder', 'RM-BINDER', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Kerosene (Anti-Mold)', 'RM-KERO', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Choline Chloride', 'RM-CHOLINE', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '488925b4-41b2-43a3-bac3-4696a2973dec',
       'Corn Oil', 'RM-COIL', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Rose (Antioxidant)', 'RM-ROSE', 'RAW_MATERIAL', 'ACTIVE', now(), now()),

      (gen_random_uuid(), '23ed4040-f5a1-42ad-b4f4-690dc1640112', '481123ec-f9ac-4e8c-9b0d-e43fe2a27105',
       'Socks (Feed Additive)', 'RM-SOCKS', 'RAW_MATERIAL', 'ACTIVE', now(), now())

    ON CONFLICT ("companyId", sku) DO NOTHING;
  END IF;
END $$;
