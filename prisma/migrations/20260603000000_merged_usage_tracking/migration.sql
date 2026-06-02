-- CreateEnum
CREATE TYPE "CreditUnitType" AS ENUM ('MESSAGE', 'SEGMENT', 'API_CALL', 'SECOND', 'MINUTE');

-- AlterTable (from templates migration)
ALTER TABLE "tbl_templates" ALTER COLUMN "media" DROP DEFAULT;

-- CreateTable: transport pricing
CREATE TABLE "tbl_transport_pricing" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "transportCuid" TEXT NOT NULL,
    "creditPerUnit" DECIMAL(10,6) NOT NULL,
    "unitType" "CreditUnitType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tbl_transport_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable: usage snapshots
CREATE TABLE "tbl_usage_snapshots" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "xref" TEXT,
    "transportCuid" TEXT NOT NULL,
    "transportType" "TransportType" NOT NULL,
    "date" DATE NOT NULL,
    "sessionCount" INTEGER NOT NULL DEFAULT 0,
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "totalCharacters" INTEGER NOT NULL DEFAULT 0,
    "totalSegments" INTEGER NOT NULL DEFAULT 0,
    "totalDurationSec" INTEGER NOT NULL DEFAULT 0,
    "totalCalls" INTEGER NOT NULL DEFAULT 0,
    "creditsUsed" DECIMAL(14,6) NOT NULL DEFAULT 0,
    "sessionCuids" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tbl_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "tbl_transport_pricing_cuid_key" ON "tbl_transport_pricing"("cuid");
CREATE UNIQUE INDEX "tbl_transport_pricing_transportCuid_key" ON "tbl_transport_pricing"("transportCuid");
CREATE UNIQUE INDEX "tbl_usage_snapshots_cuid_key" ON "tbl_usage_snapshots"("cuid");
CREATE INDEX "tbl_usage_snapshots_app_date_idx" ON "tbl_usage_snapshots"("app", "date");
CREATE INDEX "tbl_usage_snapshots_app_xref_date_idx" ON "tbl_usage_snapshots"("app", "xref", "date");
CREATE UNIQUE INDEX "tbl_usage_snapshots_app_xref_transportCuid_date_key" ON "tbl_usage_snapshots"("app", "xref", "transportCuid", "date");

-- Foreign keys
ALTER TABLE "tbl_transport_pricing" ADD CONSTRAINT "tbl_transport_pricing_transportCuid_fkey" FOREIGN KEY ("transportCuid") REFERENCES "tbl_transports"("cuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- Make xref non-nullable with default
ALTER TABLE "tbl_usage_snapshots" ALTER COLUMN "xref" SET NOT NULL, ALTER COLUMN "xref" SET DEFAULT '';
