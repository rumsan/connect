/*
  Warnings:

  - You are about to drop the column `schema` on the `tbl_templates` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "tbl_templates" DROP COLUMN "schema",
ADD COLUMN     "xref" TEXT;
