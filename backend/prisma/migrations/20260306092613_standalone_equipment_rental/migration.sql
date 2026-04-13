/*
  Warnings:

  - A unique constraint covering the columns `[rental_code]` on the table `equipment_rentals` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."equipment_rentals" ADD COLUMN     "rental_code" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "user_id" TEXT,
ALTER COLUMN "booking_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "equipment_rentals_rental_code_key" ON "public"."equipment_rentals"("rental_code");

-- CreateIndex
CREATE INDEX "equipment_rentals_user_id_idx" ON "public"."equipment_rentals"("user_id");

-- CreateIndex
CREATE INDEX "equipment_rentals_rental_code_idx" ON "public"."equipment_rentals"("rental_code");

-- CreateIndex
CREATE INDEX "product_variants_stock_quantity_idx" ON "public"."product_variants"("stock_quantity");

-- CreateIndex
CREATE INDEX "products_stock_quantity_idx" ON "public"."products"("stock_quantity");

-- AddForeignKey
ALTER TABLE "public"."equipment_rentals" ADD CONSTRAINT "equipment_rentals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
