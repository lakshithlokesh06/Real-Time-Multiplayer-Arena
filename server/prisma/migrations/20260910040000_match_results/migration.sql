-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('IN_GAME', 'FINISHED');

-- CreateTable
CREATE TABLE "Match" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "roomName" VARCHAR(48) NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'IN_GAME',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationLimitSeconds" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "endReason" VARCHAR(20),
    "winnerPlayerProfileId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "participantKey" UUID NOT NULL,
    "playerProfileId" UUID,
    "username" VARCHAR(20) NOT NULL,
    "displayName" VARCHAR(40) NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "eliminations" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "placement" INTEGER,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "leftEarly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Match_status_endedAt_idx" ON "Match"("status", "endedAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_playerProfileId_matchId_idx" ON "MatchParticipant"("playerProfileId", "matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_participantKey_key" ON "MatchParticipant"("matchId", "participantKey");

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerPlayerProfileId_fkey" FOREIGN KEY ("winnerPlayerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_playerProfileId_fkey" FOREIGN KEY ("playerProfileId") REFERENCES "PlayerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
