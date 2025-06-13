/*
  Warnings:

  - You are about to drop the column `context` on the `CharismaProfile` table. All the data in the column will be lost.
  - You are about to drop the column `locationId` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `questId` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `tags` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `boundTo` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `source` on the `Item` table. All the data in the column will be lost.
  - The `value` column on the `Item` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `charges` column on the `Item` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `characterStatsId` on the `Npc` table. All the data in the column will be lost.
  - You are about to drop the column `charismaProfileId` on the `Npc` table. All the data in the column will be lost.
  - You are about to drop the column `factionId` on the `Npc` table. All the data in the column will be lost.
  - You are about to drop the column `gmNotes` on the `Npc` table. All the data in the column will be lost.
  - You are about to drop the column `locationId` on the `Npc` table. All the data in the column will be lost.
  - You are about to drop the column `act` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `stepIds` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the `Scene` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SceneNpc` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SceneQuest` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Step` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[questStepId]` on the table `Encounter` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `campaignId` to the `CampaignLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CampaignLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CharacterStats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `CharismaMatrix` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CharismaMatrix` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CharismaProfile` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Encounter` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `Faction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Faction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `Item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `Location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Location` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `Monster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Monster` table without a default value. This is not possible if the table is not empty.
  - Added the required column `campaignId` to the `Npc` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Npc` table without a default value. This is not possible if the table is not empty.
  - Added the required column `actId` to the `Quest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Quest` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Npc" DROP CONSTRAINT "Npc_characterStatsId_fkey";

-- DropForeignKey
ALTER TABLE "Npc" DROP CONSTRAINT "Npc_charismaProfileId_fkey";

-- DropForeignKey
ALTER TABLE "Scene" DROP CONSTRAINT "Scene_locationId_fkey";

-- DropForeignKey
ALTER TABLE "SceneNpc" DROP CONSTRAINT "SceneNpc_npcId_fkey";

-- DropForeignKey
ALTER TABLE "SceneNpc" DROP CONSTRAINT "SceneNpc_sceneId_fkey";

-- DropForeignKey
ALTER TABLE "SceneQuest" DROP CONSTRAINT "SceneQuest_questId_fkey";

-- DropForeignKey
ALTER TABLE "SceneQuest" DROP CONSTRAINT "SceneQuest_sceneId_fkey";

-- DropIndex
DROP INDEX "Npc_characterStatsId_key";

-- AlterTable
ALTER TABLE "CampaignLog" ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "CharacterStats" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "CharismaMatrix" ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "CharismaProfile" DROP COLUMN "context",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "factionId" TEXT,
ADD COLUMN     "npcId" TEXT,
ADD COLUMN     "playerId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "groupId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Encounter" DROP COLUMN "locationId",
DROP COLUMN "questId",
DROP COLUMN "tags",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "questStepId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Faction" ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "boundTo",
DROP COLUMN "source",
ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "encounterId" TEXT,
ADD COLUMN     "monsterId" TEXT,
ADD COLUMN     "npcId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "description" SET DATA TYPE TEXT,
DROP COLUMN "value",
ADD COLUMN     "value" INTEGER,
DROP COLUMN "charges",
ADD COLUMN     "charges" INTEGER;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Monster" ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Npc" DROP COLUMN "characterStatsId",
DROP COLUMN "charismaProfileId",
DROP COLUMN "factionId",
DROP COLUMN "gmNotes",
DROP COLUMN "locationId",
ADD COLUMN     "campaignId" TEXT NOT NULL,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Quest" DROP COLUMN "act",
DROP COLUMN "status",
DROP COLUMN "stepIds",
DROP COLUMN "type",
ADD COLUMN     "actId" TEXT NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "visuals" JSONB;

-- DropTable
DROP TABLE "Scene";

-- DropTable
DROP TABLE "SceneNpc";

-- DropTable
DROP TABLE "SceneQuest";

-- DropTable
DROP TABLE "Step";

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Act" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "files" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,

    CONSTRAINT "PlayerGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestStep" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "requirements" JSONB,
    "decision" JSONB,
    "nextStepByOutcome" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "questId" TEXT NOT NULL,

    CONSTRAINT "QuestStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Filler" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" JSONB,
    "trigger" JSONB,
    "visuals" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "actId" TEXT NOT NULL,

    CONSTRAINT "Filler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" JSONB,
    "trigger" JSONB,
    "visuals" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "actId" TEXT NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[],
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Config_campaignId_key" ON "Config"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Encounter_questStepId_key" ON "Encounter"("questStepId");

-- AddForeignKey
ALTER TABLE "Act" ADD CONSTRAINT "Act_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Config" ADD CONSTRAINT "Config_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGroup" ADD CONSTRAINT "PlayerGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PlayerGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestStep" ADD CONSTRAINT "QuestStep_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Filler" ADD CONSTRAINT "Filler_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_questStepId_fkey" FOREIGN KEY ("questStepId") REFERENCES "QuestStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Monster" ADD CONSTRAINT "Monster_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faction" ADD CONSTRAINT "Faction_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharismaMatrix" ADD CONSTRAINT "CharismaMatrix_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharismaProfile" ADD CONSTRAINT "CharismaProfile_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "CharismaMatrix"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharismaProfile" ADD CONSTRAINT "CharismaProfile_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharismaProfile" ADD CONSTRAINT "CharismaProfile_factionId_fkey" FOREIGN KEY ("factionId") REFERENCES "Faction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharismaProfile" ADD CONSTRAINT "CharismaProfile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharismaProfile" ADD CONSTRAINT "CharismaProfile_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PlayerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignLog" ADD CONSTRAINT "CampaignLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
