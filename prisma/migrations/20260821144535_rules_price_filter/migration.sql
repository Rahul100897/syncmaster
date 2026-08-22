-- AlterTable
ALTER TABLE "StoreConnection" ADD COLUMN     "filterConfig" JSONB;

-- AlterTable
ALTER TABLE "SyncRule" ADD COLUMN     "priceFixed" DOUBLE PRECISION,
ADD COLUMN     "rounding" TEXT;
