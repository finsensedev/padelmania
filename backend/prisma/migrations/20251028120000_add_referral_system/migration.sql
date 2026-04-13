-- CreateEnum for ReferralStatus
DO $$ BEGIN
 CREATE TYPE "public"."ReferralStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

-- AlterTable: Add referral fields to users
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "referral_code" TEXT;
ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "referred_by_user_id" TEXT;

-- CreateTable: referrals
CREATE TABLE IF NOT EXISTS "public"."referrals" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referred_user_id" TEXT,
    "referral_code" TEXT NOT NULL,
    "status" "public"."ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "users_referral_code_idx" ON "public"."users"("referral_code");
CREATE UNIQUE INDEX IF NOT EXISTS "users_referral_code_key" ON "public"."users"("referral_code");

-- CreateIndex for referrals
CREATE INDEX IF NOT EXISTS "referrals_referrer_id_idx" ON "public"."referrals"("referrer_id");
CREATE INDEX IF NOT EXISTS "referrals_referred_user_id_idx" ON "public"."referrals"("referred_user_id");
CREATE INDEX IF NOT EXISTS "referrals_referral_code_idx" ON "public"."referrals"("referral_code");
CREATE INDEX IF NOT EXISTS "referrals_status_idx" ON "public"."referrals"("status");

-- AddForeignKey
DO $$ BEGIN
 ALTER TABLE "public"."users" ADD CONSTRAINT "users_referred_by_user_id_fkey" 
 FOREIGN KEY ("referred_by_user_id") REFERENCES "public"."users"("id") 
 ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" 
 FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") 
 ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "public"."referrals" ADD CONSTRAINT "referrals_referred_user_id_fkey" 
 FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") 
 ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
