-- AlterTable
ALTER TABLE "public"."bookings" ADD COLUMN     "generated_gift_card_id" TEXT,
ADD COLUMN     "gift_card_generated" BOOLEAN DEFAULT false;

-- RenameIndex
ALTER INDEX "public"."notifications_created_idx" RENAME TO "notifications_created_at_idx";
