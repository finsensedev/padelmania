-- Add ADJUSTMENT point type for loyalty ledger corrections
ALTER TYPE "PointType"
ADD
    VALUE IF NOT EXISTS 'ADJUSTMENT';