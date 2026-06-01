-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "tbl_templates" (
    "id" SERIAL NOT NULL,
    "cuid" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "transportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "TemplateStatus" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'en',
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "tbl_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tbl_templates_cuid_key" ON "tbl_templates"("cuid");

-- AddForeignKey
ALTER TABLE "tbl_templates" ADD CONSTRAINT "tbl_templates_transportId_fkey" FOREIGN KEY ("transportId") REFERENCES "tbl_transports"("cuid") ON DELETE RESTRICT ON UPDATE CASCADE;
