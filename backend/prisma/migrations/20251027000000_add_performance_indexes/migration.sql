-- Add performance indexes for frequently queried fields

-- Booking indexes for availability and user history queries
CREATE INDEX IF NOT EXISTS "bookings_court_start_status_idx" ON "bookings"("court_id", "start_time", "status");
CREATE INDEX IF NOT EXISTS "bookings_user_status_created_idx" ON "bookings"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "bookings_status_start_idx" ON "bookings"("status", "start_time");

-- Payment indexes for lookups and reporting
CREATE INDEX IF NOT EXISTS "payments_user_status_created_idx" ON "payments"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "payments_booking_status_idx" ON "payments"("booking_id", "status");
CREATE INDEX IF NOT EXISTS "payments_created_idx" ON "payments"("created_at" DESC);

-- Notification indexes for user inbox queries
CREATE INDEX IF NOT EXISTS "notifications_user_read_created_idx" ON "notifications"("user_id", "is_read", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications"("created_at" DESC);

-- Audit log indexes for tracking and compliance
CREATE INDEX IF NOT EXISTS "audit_logs_user_entity_created_idx" ON "audit_logs"("user_id", "entity", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entityid_idx" ON "audit_logs"("entity", "entity_id");

-- Court schedule index
CREATE INDEX IF NOT EXISTS "court_schedules_court_day_idx" ON "court_schedules"("court_id", "day_of_week");

-- Pricing rules index for faster lookups
CREATE INDEX IF NOT EXISTS "pricing_rules_court_active_priority_idx" ON "pricing_rules"("court_id", "is_active", "priority" DESC);

-- Equipment rental index for booking equipment queries
CREATE INDEX IF NOT EXISTS "equipment_rentals_booking_idx" ON "equipment_rentals"("booking_id");

-- Loyalty points index
CREATE INDEX IF NOT EXISTS "loyalty_points_user_created_idx" ON "loyalty_points"("user_id", "created_at" DESC);

-- Gift card indexes
CREATE INDEX IF NOT EXISTS "giftcards_status_active_idx" ON "giftcards"("status", "is_active");
CREATE INDEX IF NOT EXISTS "giftcard_ledgers_giftcard_created_idx" ON "giftcard_ledgers"("giftcard_id", "created_at" DESC);
