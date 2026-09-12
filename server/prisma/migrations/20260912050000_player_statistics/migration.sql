-- CreateTable
CREATE TABLE "PlayerStatistics" (
    "playerProfileId" UUID NOT NULL,
    "totalMatches" INTEGER NOT NULL DEFAULT 0,
    "ratedMatches" INTEGER NOT NULL DEFAULT 0,
    "unratedMatches" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "eliminations" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "ratedWins" INTEGER NOT NULL DEFAULT 0,
    "ratedLosses" INTEGER NOT NULL DEFAULT 0,
    "ratedTies" INTEGER NOT NULL DEFAULT 0,
    "ratedEliminations" INTEGER NOT NULL DEFAULT 0,
    "ratedDeaths" INTEGER NOT NULL DEFAULT 0,
    "currentWinStreak" INTEGER NOT NULL DEFAULT 0,
    "bestWinStreak" INTEGER NOT NULL DEFAULT 0,
    "peakMmr" INTEGER NOT NULL DEFAULT 1000,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStatistics_pkey" PRIMARY KEY ("playerProfileId")
);

-- CreateIndex
CREATE INDEX "PlayerStatistics_ratedMatches_idx" ON "PlayerStatistics"("ratedMatches");

-- CreateIndex
CREATE INDEX "PlayerProfile_rating_id_idx" ON "PlayerProfile"("rating", "id");

-- AddForeignKey
ALTER TABLE "PlayerStatistics" ADD CONSTRAINT "PlayerStatistics_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing accounts retain their rating; career counters begin at this migration.
INSERT INTO "PlayerStatistics" ("playerProfileId", "peakMmr", "updatedAt")
SELECT id, GREATEST(1000, rating), CURRENT_TIMESTAMP FROM "PlayerProfile";
CREATE INDEX "Match_competitive_history_idx" ON "Match" ("endedAt" DESC, id DESC)
WHERE status = 'FINISHED' AND "roomType" = 'MATCHMAKING' AND "endReason" = 'TIME_LIMIT';
