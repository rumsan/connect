-- CreateEnum
CREATE TYPE "CreditUnitType" AS ENUM ('MESSAGE', 'SEGMENT', 'API_CALL', 'SECOND', 'MINUTE');

-- AlterTable
ALTER TABLE "tbl_templates" ALTER COLUMN "media" DROP DEFAULT;

-- CreateTable
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

-- CreateTable
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tbl_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_transport_pricing_cuid_key" ON "tbl_transport_pricing"("cuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_transport_pricing_transportCuid_key" ON "tbl_transport_pricing"("transportCuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_usage_snapshots_cuid_key" ON "tbl_usage_snapshots"("cuid");

-- CreateIndex
CREATE INDEX "tbl_usage_snapshots_app_date_idx" ON "tbl_usage_snapshots"("app", "date");

-- CreateIndex
CREATE INDEX "tbl_usage_snapshots_app_xref_date_idx" ON "tbl_usage_snapshots"("app", "xref", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_usage_snapshots_app_xref_transportCuid_date_key" ON "tbl_usage_snapshots"("app", "xref", "transportCuid", "date");

-- AddForeignKey
ALTER TABLE "tbl_transport_pricing" ADD CONSTRAINT "tbl_transport_pricing_transportCuid_fkey" FOREIGN KEY ("transportCuid") REFERENCES "tbl_transports"("cuid") ON DELETE CASCADE ON UPDATE CASCADE;
