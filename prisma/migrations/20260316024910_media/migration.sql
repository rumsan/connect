/*
  Warnings:

  - You are about to drop the column `variables` on the `tbl_templates` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tbl_templates" DROP COLUMN "variables",
ADD COLUMN     "media" TEXT[];
