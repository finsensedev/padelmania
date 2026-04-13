-- CreateTable
CREATE TABLE "public"."loyalty_config" (
    "id" TEXT NOT NULL,
    "points_per_currency" INTEGER NOT NULL DEFAULT 1,
    "currency_unit" INTEGER NOT NULL DEFAULT 100,
    "registration_bonus_points" INTEGER NOT NULL DEFAULT 40,
    "referral_bonus_points" INTEGER NOT NULL DEFAULT 20,
    "minimum_redeemable_points" INTEGER NOT NULL DEFAULT 100,
    "points_to_giftcard_ratio" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_config_pkey" PRIMARY KEY ("id")
);
