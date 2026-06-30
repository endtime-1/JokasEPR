-- Migration: storefront fields for Product and SalesOrder

-- Product: public listing fields
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publicSlug" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publicDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "publicImageUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "storefrontCategory" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minOrderQty" DECIMAL(10,2) DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "unitLabel" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_publicSlug_key" ON "Product"("publicSlug");

-- SalesOrder: storefront / online order fields
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "isStorefrontOrder" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "storefrontRef" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "storefrontCustomerName" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "storefrontCustomerPhone" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "storefrontCustomerEmail" TEXT;
ALTER TABLE "SalesOrder" ADD COLUMN IF NOT EXISTS "storefrontDeliveryAddress" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SalesOrder_storefrontRef_key" ON "SalesOrder"("storefrontRef");
