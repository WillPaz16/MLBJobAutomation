-- CreateTable
CREATE TABLE "ApplicantIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'identity',
    "legalFirstName" TEXT,
    "legalMiddleName" TEXT,
    "legalLastName" TEXT,
    "preferredName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressStreet" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "addressCountry" TEXT,
    "dateOfBirth" TEXT,
    "requiresSponsorship" BOOLEAN,
    "authorizedToWorkUs" BOOLEAN,
    "genderIdentityCode" TEXT,
    "genderIdentityLabel" TEXT,
    "raceEthnicityCode" TEXT,
    "raceEthnicityLabel" TEXT,
    "disabilityStatusCode" TEXT,
    "disabilityStatusLabel" TEXT,
    "veteranStatusCode" TEXT,
    "veteranStatusLabel" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "githubUrl" TEXT,
    "otherUrl" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "EducationEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicantIdentityId" TEXT NOT NULL,
    "school" TEXT,
    "degree" TEXT,
    "fieldOfStudy" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "gpa" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "EducationEntry_applicantIdentityId_fkey" FOREIGN KEY ("applicantIdentityId") REFERENCES "ApplicantIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnswerSnippet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "tags" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AnswerOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "snippetId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnswerOverride_snippetId_fkey" FOREIGN KEY ("snippetId") REFERENCES "AnswerSnippet" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EducationEntry_applicantIdentityId_idx" ON "EducationEntry"("applicantIdentityId");

-- CreateIndex
CREATE INDEX "AnswerOverride_applicationId_idx" ON "AnswerOverride"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "AnswerOverride_applicationId_questionKey_key" ON "AnswerOverride"("applicationId", "questionKey");
