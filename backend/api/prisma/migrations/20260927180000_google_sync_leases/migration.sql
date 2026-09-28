-- A heartbeat and lease token let the poller reclaim runs abandoned by a
-- crashed API process without stealing a live run from another API instance.
ALTER TABLE "GoogleDriveFolderLink"
  ADD COLUMN "syncHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "syncLeaseId" TEXT;
