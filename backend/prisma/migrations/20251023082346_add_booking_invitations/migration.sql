-- CreateEnum
CREATE TYPE "public"."BookingInvitationStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateTable
CREATE TABLE "public"."booking_invitations" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "public"."BookingInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "user_id" TEXT,
    "user_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_invitations_booking_id_idx" ON "public"."booking_invitations"("booking_id");

-- CreateIndex
CREATE INDEX "booking_invitations_email_idx" ON "public"."booking_invitations"("email");

-- CreateIndex
CREATE INDEX "booking_invitations_status_idx" ON "public"."booking_invitations"("status");

-- AddForeignKey
ALTER TABLE "public"."booking_invitations" ADD CONSTRAINT "booking_invitations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
