/*
 Warnings:
 
 - The values [REFERRAL] on the enum `PointType` will be removed. If these variants are still used in the database, this will fail.
 
 */
-- First, update any existing REFERRAL records to BONUS to preserve data
UPDATE
  "public"."loyalty_points"
SET
  "type" = 'BONUS'
WHERE
  "type" = 'REFERRAL';

-- AlterEnum
BEGIN;

CREATE TYPE "public"."PointType_new" AS ENUM (
  'EARNED',
  'REDEEMED',
  'EXPIRED',
  'BONUS',
  'ADJUSTMENT'
);

ALTER TABLE
  "public"."loyalty_points"
ALTER COLUMN
  "type" TYPE "public"."PointType_new" USING ("type" :: text :: "public"."PointType_new");

ALTER TYPE "public"."PointType" RENAME TO "PointType_old";

ALTER TYPE "public"."PointType_new" RENAME TO "PointType";

DROP TYPE "public"."PointType_old";

COMMIT;