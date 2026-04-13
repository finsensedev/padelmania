/*
  Warnings:

  - You are about to drop the column `type` on the `courts` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."courts_type_idx";

-- AlterTable
ALTER TABLE "public"."courts" DROP COLUMN "type";

-- DropEnum
DROP TYPE "public"."CourtType";
