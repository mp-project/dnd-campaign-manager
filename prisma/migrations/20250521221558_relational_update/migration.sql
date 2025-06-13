/*
  Warnings:

  - You are about to drop the column `enemies` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `npcIds` on the `Encounter` table. All the data in the column will be lost.
  - You are about to drop the column `allies` on the `Faction` table. All the data in the column will be lost.
  - You are about to drop the column `enemies` on the `Faction` table. All the data in the column will be lost.
  - You are about to drop the column `linkedLocationIds` on the `Faction` table. All the data in the column will be lost.
  - You are about to drop the column `linkedNpcIds` on the `Faction` table. All the data in the column will be lost.
  - You are about to drop the column `linkedQuestIds` on the `Faction` table. All the data in the column will be lost.
  - You are about to drop the column `linkedEncounterIds` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `linkedLocationIds` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `linkedNpcIds` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `linkedQuestIds` on the `Quest` table. All the data in the column will be lost.
  - You are about to drop the column `linkedEncounterIds` on the `Scene` table. All the data in the column will be lost.
  - You are about to drop the column `linkedEventIds` on the `Scene` table. All the data in the column will be lost.
  - You are about to drop the column `linkedNpcIds` on the `Scene` table. All the data in the column will be lost.
  - You are about to drop the column `linkedQuestIds` on the `Scene` table. All the data in the column will be lost.
  - You are about to drop the column `linkedStepIds` on the `Scene` table. All the data in the column will be lost.
  - You are about to drop the `_NpcQuests` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_NpcQuests" DROP CONSTRAINT "_NpcQuests_A_fkey";

-- DropForeignKey
ALTER TABLE "_NpcQuests" DROP CONSTRAINT "_NpcQuests_B_fkey";

-- AlterTable
ALTER TABLE "Encounter" DROP COLUMN "enemies",
DROP COLUMN "npcIds";

-- AlterTable
ALTER TABLE "Faction" DROP COLUMN "allies",
DROP COLUMN "enemies",
DROP COLUMN "linkedLocationIds",
DROP COLUMN "linkedNpcIds",
DROP COLUMN "linkedQuestIds";

-- AlterTable
ALTER TABLE "Quest" DROP COLUMN "linkedEncounterIds",
DROP COLUMN "linkedLocationIds",
DROP COLUMN "linkedNpcIds",
DROP COLUMN "linkedQuestIds";

-- AlterTable
ALTER TABLE "Scene" DROP COLUMN "linkedEncounterIds",
DROP COLUMN "linkedEventIds",
DROP COLUMN "linkedNpcIds",
DROP COLUMN "linkedQuestIds",
DROP COLUMN "linkedStepIds";

-- DropTable
DROP TABLE "_NpcQuests";

-- CreateTable
CREATE TABLE "EncounterNpc" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,

    CONSTRAINT "EncounterNpc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterMonster" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "monsterId" TEXT NOT NULL,

    CONSTRAINT "EncounterMonster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneNpc" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "npcId" TEXT NOT NULL,

    CONSTRAINT "SceneNpc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SceneQuest" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,

    CONSTRAINT "SceneQuest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EncounterNpc" ADD CONSTRAINT "EncounterNpc_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterNpc" ADD CONSTRAINT "EncounterNpc_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMonster" ADD CONSTRAINT "EncounterMonster_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterMonster" ADD CONSTRAINT "EncounterMonster_monsterId_fkey" FOREIGN KEY ("monsterId") REFERENCES "Monster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_giverNpcId_fkey" FOREIGN KEY ("giverNpcId") REFERENCES "Npc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quest" ADD CONSTRAINT "Quest_startLocationId_fkey" FOREIGN KEY ("startLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scene" ADD CONSTRAINT "Scene_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneNpc" ADD CONSTRAINT "SceneNpc_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneNpc" ADD CONSTRAINT "SceneNpc_npcId_fkey" FOREIGN KEY ("npcId") REFERENCES "Npc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneQuest" ADD CONSTRAINT "SceneQuest_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "Scene"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SceneQuest" ADD CONSTRAINT "SceneQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "Quest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
