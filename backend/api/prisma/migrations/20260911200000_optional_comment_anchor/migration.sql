-- General comments are not tied to a selected document range.
ALTER TABLE "CommentThread" ALTER COLUMN "anchor" DROP NOT NULL;
