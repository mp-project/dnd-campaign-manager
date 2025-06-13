/*
  Warnings:

  - You are about to drop the column `expires` on the `VerificationToken` table. All the data in the column will be lost.
  - You are about to drop the column `identifier` on the `VerificationToken` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[provider,providerAccountId]` on the table `Account` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,token]` on the table `VerificationToken` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `VerificationToken` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expiresAt` to the `VerificationToken` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `VerificationToken` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'REDACTOR', 'USER');

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropIndex
DROP INDEX "VerificationToken_identifier_token_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "password" TEXT,
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER',
ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "VerificationToken" DROP COLUMN "expires",
DROP COLUMN "identifier",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_email_token_key" ON "VerificationToken"("email", "token");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
