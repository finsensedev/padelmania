-- AlterTable
ALTER TABLE "public"."pricing_rules" ADD COLUMN     "balls_price_value" DECIMAL(10,2),
ADD COLUMN     "balls_pricing_type" "public"."PricingType";
