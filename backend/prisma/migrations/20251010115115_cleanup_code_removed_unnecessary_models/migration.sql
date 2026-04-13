/*
  Warnings:

  - You are about to drop the `leave_requests` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `payrolls` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `shifts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `staff` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."attendances" DROP CONSTRAINT "attendances_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."leave_requests" DROP CONSTRAINT "leave_requests_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."payrolls" DROP CONSTRAINT "payrolls_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."shifts" DROP CONSTRAINT "shifts_staff_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."staff" DROP CONSTRAINT "staff_user_id_fkey";

-- DropTable
DROP TABLE "public"."leave_requests";

-- DropTable
DROP TABLE "public"."payrolls";

-- DropTable
DROP TABLE "public"."shifts";

-- DropTable
DROP TABLE "public"."staff";

-- DropTable
DROP TABLE "public"."system_settings";

-- CreateIndex
CREATE INDEX "equipment_is_active_idx" ON "public"."equipment"("is_active");

-- CreateIndex
CREATE INDEX "loyalty_points_created_at_idx" ON "public"."loyalty_points"("created_at");

-- CreateIndex
CREATE INDEX "membership_cards_tier_idx" ON "public"."membership_cards"("tier");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "public"."notifications"("created_at");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "public"."payments"("booking_id");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "public"."reviews"("created_at");
