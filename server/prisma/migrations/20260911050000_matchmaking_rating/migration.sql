-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('MANUAL', 'MATCHMAKING');

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "rating" INTEGER NOT NULL DEFAULT 1000;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "roomType" "RoomType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "MatchParticipant" ADD COLUMN     "ratingAfter" INTEGER,
ADD COLUMN     "ratingBefore" INTEGER,
ADD COLUMN     "ratingDelta" INTEGER;
