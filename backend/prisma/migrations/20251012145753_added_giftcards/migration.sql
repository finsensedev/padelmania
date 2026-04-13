-- CreateEnum
CREATE TYPE "public"."GiftCardStatus" AS ENUM ('ISSUED', 'REDEEMED', 'EXHAUSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."GiftCardLedgerType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "public"."giftcards" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "public"."GiftCardStatus" NOT NULL DEFAULT 'ISSUED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "purchased_by_user_id" TEXT,
    "redeemed_by_user_id" TEXT,
    "redeemed_at" TIMESTAMP(3),
    "recipient_email" TEXT,
    "message" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "giftcards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."giftcard_ledgers" (
    "id" TEXT NOT NULL,
    "giftcard_id" TEXT NOT NULL,
    "performed_by_user_id" TEXT,
    "type" "public"."GiftCardLedgerType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "giftcard_ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "giftcards_code_key" ON "public"."giftcards"("code");

-- CreateIndex
CREATE INDEX "giftcards_purchased_by_user_id_idx" ON "public"."giftcards"("purchased_by_user_id");

-- CreateIndex
CREATE INDEX "giftcards_redeemed_by_user_id_idx" ON "public"."giftcards"("redeemed_by_user_id");

-- CreateIndex
CREATE INDEX "giftcards_status_idx" ON "public"."giftcards"("status");

-- CreateIndex
CREATE INDEX "giftcards_is_active_idx" ON "public"."giftcards"("is_active");

-- CreateIndex
CREATE INDEX "giftcard_ledgers_giftcard_id_idx" ON "public"."giftcard_ledgers"("giftcard_id");

-- CreateIndex
CREATE INDEX "giftcard_ledgers_performed_by_user_id_idx" ON "public"."giftcard_ledgers"("performed_by_user_id");

-- CreateIndex
CREATE INDEX "giftcard_ledgers_type_idx" ON "public"."giftcard_ledgers"("type");

-- AddForeignKey
ALTER TABLE "public"."giftcards" ADD CONSTRAINT "giftcards_purchased_by_user_id_fkey" FOREIGN KEY ("purchased_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giftcards" ADD CONSTRAINT "giftcards_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giftcard_ledgers" ADD CONSTRAINT "giftcard_ledgers_giftcard_id_fkey" FOREIGN KEY ("giftcard_id") REFERENCES "public"."giftcards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."giftcard_ledgers" ADD CONSTRAINT "giftcard_ledgers_performed_by_user_id_fkey" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
