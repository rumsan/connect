/*
  Warnings:

  - Made the column `xref` on table `tbl_usage_snapshots` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "tbl_usage_snapshots" ALTER COLUMN "xref" SET NOT NULL,
ALTER COLUMN "xref" SET DEFAULT '';
