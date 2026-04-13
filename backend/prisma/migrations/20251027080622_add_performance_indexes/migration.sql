-- DropIndex
DROP INDEX "public"."audit_logs_entity_entityid_idx";

-- DropIndex
DROP INDEX "public"."audit_logs_user_entity_created_idx";

-- DropIndex
DROP INDEX "public"."court_schedules_court_day_idx";

-- DropIndex
DROP INDEX "public"."giftcard_ledgers_giftcard_created_idx";

-- DropIndex
DROP INDEX "public"."giftcards_status_active_idx";

-- DropIndex
DROP INDEX "public"."loyalty_points_user_created_idx";

-- DropIndex
DROP INDEX "public"."notifications_created_at_idx";

-- DropIndex
DROP INDEX "public"."pricing_rules_court_active_priority_idx";

-- RenameIndex
ALTER INDEX "public"."bookings_court_start_status_idx" RENAME TO "bookings_court_id_start_time_status_idx";

-- RenameIndex
ALTER INDEX "public"."bookings_status_start_idx" RENAME TO "bookings_status_start_time_idx";

-- RenameIndex
ALTER INDEX "public"."bookings_user_status_created_idx" RENAME TO "bookings_user_id_status_created_at_idx";

-- RenameIndex
ALTER INDEX "public"."notifications_user_read_created_idx" RENAME TO "notifications_user_id_is_read_created_at_idx";

-- RenameIndex
ALTER INDEX "public"."payments_booking_status_idx" RENAME TO "payments_booking_id_status_idx";

-- RenameIndex
ALTER INDEX "public"."payments_created_idx" RENAME TO "payments_created_at_idx";

-- RenameIndex
ALTER INDEX "public"."payments_user_status_created_idx" RENAME TO "payments_user_id_status_created_at_idx";
