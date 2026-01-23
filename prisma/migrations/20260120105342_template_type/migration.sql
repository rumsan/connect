/*
  Warnings:

  - Added the required column `type` to the `tbl_templates` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('TEXT', 'MEDIA');

-- AlterTable
ALTER TABLE "tbl_templates" ADD COLUMN     "type" "TemplateType" NOT NULL;
