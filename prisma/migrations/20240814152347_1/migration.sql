-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('SMTP', 'VOICE', 'API', 'SES', 'ECHO');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('NEW', 'PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('IMMEDIATE', 'SCHEDULED', 'MANUAL');

-- CreateEnum
CREATE TYPE "BroadcastStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAIL');

-- CreateEnum
CREATE TYPE "ApplicationEnvironment" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST');

-- CreateTable
CREATE TABLE "tbl_transports" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransportType" NOT NULL,
    "config" JSONB NOT NULL,
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_transports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_sessions" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "addresses" JSONB NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "triggerType" "TriggerType" NOT NULL DEFAULT 'IMMEDIATE',
    "webhook" TEXT,
    "options" JSONB,
    "status" "SessionStatus" NOT NULL DEFAULT 'NEW',
    "totalAddresses" INTEGER NOT NULL,
    "stats" JSONB,
    "isTransportVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_broadcasts" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'PENDING',
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" TIMESTAMP(3),
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "queuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_broadcast_logs" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "broadcast" TEXT NOT NULL,
    "status" "BroadcastStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL,
    "details" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_broadcast_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tbl_applications" (
    "cuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "description" TEXT,
    "environment" "ApplicationEnvironment" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL DEFAULT 'system',
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_applications_pkey" PRIMARY KEY ("cuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_transports_cuid_key" ON "tbl_transports"("cuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_sessions_cuid_key" ON "tbl_sessions"("cuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_broadcasts_cuid_key" ON "tbl_broadcasts"("cuid");

-- CreateIndex
CREATE UNIQUE INDEX "tbl_broadcast_logs_cuid_key" ON "tbl_broadcast_logs"("cuid");

-- AddForeignKey
ALTER TABLE "tbl_sessions" ADD CONSTRAINT "tbl_sessions_transport_fkey" FOREIGN KEY ("transport") REFERENCES "tbl_transports"("cuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_broadcasts" ADD CONSTRAINT "tbl_broadcasts_session_fkey" FOREIGN KEY ("session") REFERENCES "tbl_sessions"("cuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_broadcasts" ADD CONSTRAINT "tbl_broadcasts_transport_fkey" FOREIGN KEY ("transport") REFERENCES "tbl_transports"("cuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_broadcast_logs" ADD CONSTRAINT "tbl_broadcast_logs_broadcast_fkey" FOREIGN KEY ("broadcast") REFERENCES "tbl_broadcasts"("cuid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tbl_broadcast_logs" ADD CONSTRAINT "tbl_broadcast_logs_session_fkey" FOREIGN KEY ("session") REFERENCES "tbl_sessions"("cuid") ON DELETE RESTRICT ON UPDATE CASCADE;
