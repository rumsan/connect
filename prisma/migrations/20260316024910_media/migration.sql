-- Add 'media' TEXT[] column to the appropriate template/messages table
ALTER TABLE "tbl_templates" ADD COLUMN "media" TEXT[] DEFAULT '{}'::text[];
