-- CreateTable
CREATE TABLE "Learner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Learner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'design',
    "state" TEXT NOT NULL,
    "draftsJson" TEXT,
    "changeId" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "fingerprint" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "evaluatorIds" TEXT NOT NULL,
    "resultsJson" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL,
    "unchangedFromPrevious" BOOLEAN NOT NULL DEFAULT false,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Critique" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "choiceDesign" TEXT NOT NULL,
    "choiceClass" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Critique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiNote" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "attemptId" TEXT,
    "stage" TEXT,
    "refId" TEXT,
    "modelId" TEXT NOT NULL,
    "json" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DialogueTurn" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "probeId" TEXT NOT NULL,
    "turn" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DialogueTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Attempt_learnerId_problemId_attemptNumber_idx" ON "Attempt"("learnerId", "problemId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_attemptId_stage_key" ON "Submission"("attemptId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_attemptId_stage_key" ON "Evaluation"("attemptId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "Critique_learnerId_problemId_pairId_key" ON "Critique"("learnerId", "problemId", "pairId");

-- CreateIndex
CREATE INDEX "AiNote_attemptId_idx" ON "AiNote"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AiNote_kind_key_key" ON "AiNote"("kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DialogueTurn_attemptId_probeId_turn_key" ON "DialogueTurn"("attemptId", "probeId", "turn");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Critique" ADD CONSTRAINT "Critique_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
