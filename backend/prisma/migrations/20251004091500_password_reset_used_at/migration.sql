-- AlterTable
ALTER TABLE
    "public"."password_resets"
ADD
    COLUMN "used_at" TIMESTAMP(3);

-- Backfill existing data
UPDATE
    "public"."password_resets"
SET
    "used_at" = COALESCE("used_at", CURRENT_TIMESTAMP)
WHERE
    "used" = TRUE;