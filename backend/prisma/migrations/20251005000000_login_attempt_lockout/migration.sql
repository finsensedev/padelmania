-- Add login security columns to track failed attempts and lockout window
ALTER TABLE
    "public"."users"
ADD
    COLUMN "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD
    COLUMN "account_locked_until" TIMESTAMP(3);