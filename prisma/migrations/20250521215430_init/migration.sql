-- CreateTable
CREATE TABLE "Npc" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "race" TEXT,
    "class" TEXT,
    "alignment" TEXT,
    "role" TEXT,
    "factionId" TEXT,
    "locationId" TEXT,
    "characterStatsId" TEXT,
    "charismaProfileId" TEXT,
    "description" TEXT,
    "hoverInfo" TEXT,
    "gmNotes" TEXT,
    "media" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Npc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharacterStats" (
    "id" TEXT NOT NULL,
    "strength" INTEGER NOT NULL,
    "dexterity" INTEGER NOT NULL,
    "constitution" INTEGER NOT NULL,
    "intelligence" INTEGER NOT NULL,
    "wisdom" INTEGER NOT NULL,
    "charisma" INTEGER NOT NULL,
    "skills" JSONB,
    "abilities" TEXT[],

    CONSTRAINT "CharacterStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Monster" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "size" TEXT,
    "alignment" TEXT,
    "hitPoints" INTEGER NOT NULL,
    "armorClass" INTEGER NOT NULL,
    "initiativeModifier" INTEGER NOT NULL,
    "attributes" JSONB NOT NULL,
    "attacks" JSONB NOT NULL,
    "resistances" TEXT[],
    "vulnerabilities" TEXT[],
    "immunities" TEXT[],
    "loot" JSONB,
    "behavior" JSONB,
    "description" JSONB,
    "media" JSONB,
    "tags" TEXT[],

    CONSTRAINT "Monster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "subtype" TEXT,
    "rarity" TEXT,
    "description" JSONB,
    "effects" JSONB,
    "abilityCheck" JSONB,
    "value" JSONB,
    "charges" JSONB,
    "crafting" JSONB,
    "boundTo" TEXT,
    "questId" TEXT,
    "visuals" JSONB,
    "source" TEXT,
    "tags" TEXT[],

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "locationId" TEXT,
    "npcIds" TEXT[],
    "enemies" JSONB,
    "dialogOptions" JSONB,
    "skillChecks" JSONB,
    "objectives" TEXT[],
    "rewards" JSONB,
    "description" JSONB,
    "trigger" JSONB,
    "environment" JSONB,
    "visuals" JSONB,
    "tags" TEXT[],
    "questId" TEXT,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "subtype" TEXT,
    "parentId" TEXT,
    "connectedLocationIds" TEXT[],
    "tags" TEXT[],
    "visuals" JSONB,
    "description" JSONB,
    "assets" JSONB,
    "accessConditions" JSONB,
    "position" JSONB,
    "tagsGameplay" TEXT[],

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quest" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "act" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "giverNpcId" TEXT,
    "startLocationId" TEXT,
    "linkedNpcIds" TEXT[],
    "linkedLocationIds" TEXT[],
    "linkedEncounterIds" TEXT[],
    "linkedQuestIds" TEXT[],
    "requirements" JSONB,
    "stepIds" TEXT[],
    "decisions" JSONB,
    "rewards" JSONB,
    "tags" TEXT[],

    CONSTRAINT "Quest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "locationId" TEXT,
    "npcId" TEXT,
    "encounterId" TEXT,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "requirements" JSONB,
    "decision" JSONB,
    "nextStepByOutcome" JSONB,
    "gmNotes" TEXT,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scene" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "locationId" TEXT,
    "description" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "linkedNpcIds" TEXT[],
    "linkedQuestIds" TEXT[],
    "linkedStepIds" TEXT[],
    "linkedEncounterIds" TEXT[],
    "linkedEventIds" TEXT[],
    "requirements" JSONB,
    "options" JSONB,
    "visuals" JSONB,
    "tags" TEXT[],

    CONSTRAINT "Scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alias" TEXT,
    "type" TEXT,
    "alignment" TEXT,
    "visibility" TEXT,
    "knownToPublic" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "values" TEXT[],
    "goals" TEXT[],
    "territories" TEXT[],
    "influenceLevel" INTEGER,
    "reputationScore" INTEGER NOT NULL,
    "leaders" JSONB,
    "representatives" JSONB,
    "linkedNpcIds" TEXT[],
    "linkedQuestIds" TEXT[],
    "linkedLocationIds" TEXT[],
    "allies" TEXT[],
    "enemies" TEXT[],
    "tags" TEXT[],

    CONSTRAINT "Faction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharismaMatrix" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,

    CONSTRAINT "CharismaMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CharismaProfile" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "currentScore" INTEGER NOT NULL,
    "tier" INTEGER NOT NULL,
    "groupId" TEXT NOT NULL,
    "context" TEXT,
    "modifiers" JSONB,
    "scope" TEXT,
    "tags" TEXT[],
    "notes" TEXT,

    CONSTRAINT "CharismaProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "CampaignLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_NpcQuests" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_NpcQuests_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Npc_characterStatsId_key" ON "Npc"("characterStatsId");

-- CreateIndex
CREATE INDEX "_NpcQuests_B_index" ON "_NpcQuests"("B");

-- AddForeignKey
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_characterStatsId_fkey" FOREIGN KEY ("characterStatsId") REFERENCES "CharacterStats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Npc" ADD CONSTRAINT "Npc_charismaProfileId_fkey" FOREIGN KEY ("charismaProfileId") REFERENCES "CharismaProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NpcQuests" ADD CONSTRAINT "_NpcQuests_A_fkey" FOREIGN KEY ("A") REFERENCES "Npc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NpcQuests" ADD CONSTRAINT "_NpcQuests_B_fkey" FOREIGN KEY ("B") REFERENCES "Quest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
