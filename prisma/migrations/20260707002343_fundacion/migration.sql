-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('facturable', 'interno', 'desarrollo');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('activo', 'pausado', 'cerrado');

-- CreateEnum
CREATE TYPE "BlockType" AS ENUM ('tarea', 'junta', 'hito', 'descanso');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('backlog', 'planned', 'in_progress', 'done', 'deferred');

-- CreateEnum
CREATE TYPE "WeekStatus" AS ENUM ('planning', 'active', 'closed');

-- CreateEnum
CREATE TYPE "WinStatus" AS ENUM ('pendiente', 'logrado', 'fallido');

-- CreateEnum
CREATE TYPE "DeliverableStatus" AS ENUM ('borrador', 'rev_interna', 'rev_cliente', 'aceptado');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('abierto', 'cerrado');

-- CreateEnum
CREATE TYPE "IssueTipo" AS ENUM ('riesgo', 'pendiente', 'acuerdo', 'decision', 'cambio');

-- CreateEnum
CREATE TYPE "CompetencyType" AS ENUM ('individual', 'rol');

-- CreateEnum
CREATE TYPE "Alcance" AS ENUM ('sow', 'aliado');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "apiTokenHash" TEXT,
    "horarioInicio" TEXT NOT NULL DEFAULT '09:00',
    "horarioFin" TEXT NOT NULL DEFAULT '18:00',
    "comidaInicio" TEXT NOT NULL DEFAULT '14:00',
    "comidaFin" TEXT NOT NULL DEFAULT '15:00',
    "bufferPct" INTEGER NOT NULL DEFAULT 25,
    "factorManual" DECIMAL(4,2),
    "icsUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "nivelActualId" TEXT,
    "nivelObjetivoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Week" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isoWeek" TEXT NOT NULL,
    "rangoInicio" DATE NOT NULL,
    "rangoFin" DATE NOT NULL,
    "factorUsado" DECIMAL(4,2) NOT NULL,
    "reflexion" TEXT,
    "estatus" "WeekStatus" NOT NULL DEFAULT 'planning',
    "horarioOverride" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Week_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Win" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "posicion" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "dod" TEXT,
    "estatus" "WinStatus" NOT NULL DEFAULT 'pendiente',

    CONSTRAINT "Win_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "deliverableId" TEXT,
    "winId" TEXT,
    "weekId" TEXT,
    "titulo" TEXT NOT NULL,
    "estimadoMin" INTEGER,
    "ajustadoMin" INTEGER,
    "deadline" DATE,
    "estatus" "TaskStatus" NOT NULL DEFAULT 'backlog',
    "alcance" "Alcance" NOT NULL DEFAULT 'sow',
    "dolorCliente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DodItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "weekId" TEXT NOT NULL,
    "taskId" TEXT,
    "fecha" DATE NOT NULL,
    "inicio" TEXT NOT NULL,
    "fin" TEXT NOT NULL,
    "tipo" "BlockType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "planMin" INTEGER NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "manual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "inicio" TEXT NOT NULL,
    "fin" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "inicio" TEXT,
    "fin" TEXT,
    "nota" TEXT,

    CONSTRAINT "DayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pct" INTEGER NOT NULL,
    "vigenteDesde" DATE NOT NULL,
    "vigenteHasta" DATE,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "cliente" TEXT,
    "color" TEXT NOT NULL DEFAULT '#0A7C82',
    "tipo" "ProjectType" NOT NULL DEFAULT 'facturable',
    "estatus" "ProjectStatus" NOT NULL DEFAULT 'activo',
    "fechaInicio" DATE,
    "fechaFin" DATE,
    "presupuestoHoras" DECIMAL(7,2),
    "tarifaHora" DECIMAL(12,2),
    "origen" TEXT,
    "presupuestoAliadoHoras" DECIMAL(7,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "numeroSow" TEXT,
    "nombre" TEXT NOT NULL,
    "hipotesis" TEXT,
    "fechaInicio" DATE,
    "fechaComprometida" DATE,
    "fechaProyectada" DATE,
    "avancePct" INTEGER NOT NULL DEFAULT 0,
    "presupuestoHoras" DECIMAL(7,2),
    "estatus" "DeliverableStatus" NOT NULL DEFAULT 'borrador',
    "alcance" "Alcance" NOT NULL DEFAULT 'sow',
    "cartaUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deliverable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tipo" "IssueTipo" NOT NULL DEFAULT 'pendiente',
    "tema" TEXT,
    "descripcion" TEXT NOT NULL,
    "responsable" TEXT,
    "fechaCompromiso" DATE,
    "estatus" "IssueStatus" NOT NULL DEFAULT 'abierto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "expectativas" TEXT,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competency" (
    "id" TEXT NOT NULL,
    "tipo" "CompetencyType" NOT NULL,
    "grupo" TEXT,
    "texto" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,

    CONSTRAINT "Competency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "taskId" TEXT,
    "deliverableId" TEXT,
    "nota" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_TaskCompetencias" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TaskCompetencias_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_apiTokenHash_key" ON "User"("apiTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Week_userId_isoWeek_key" ON "Week"("userId", "isoWeek");

-- CreateIndex
CREATE UNIQUE INDEX "Win_weekId_posicion_key" ON "Win"("weekId", "posicion");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_stoppedAt_idx" ON "TimeEntry"("userId", "stoppedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_userId_externalId_key" ON "CalendarEvent"("userId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DayOverride_userId_fecha_key" ON "DayOverride"("userId", "fecha");

-- CreateIndex
CREATE INDEX "Allocation_userId_vigenteDesde_idx" ON "Allocation"("userId", "vigenteDesde");

-- CreateIndex
CREATE UNIQUE INDEX "Project_userId_nombre_key" ON "Project"("userId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Level_nombre_key" ON "Level"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Level_orden_key" ON "Level"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "Competency_tipo_grupo_orden_key" ON "Competency"("tipo", "grupo", "orden");

-- CreateIndex
CREATE INDEX "_TaskCompetencias_B_index" ON "_TaskCompetencias"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_nivelActualId_fkey" FOREIGN KEY ("nivelActualId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_nivelObjetivoId_fkey" FOREIGN KEY ("nivelObjetivoId") REFERENCES "Level"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Week" ADD CONSTRAINT "Week_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Win" ADD CONSTRAINT "Win_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_winId_fkey" FOREIGN KEY ("winId") REFERENCES "Win"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DodItem" ADD CONSTRAINT "DodItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "Week"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOverride" ADD CONSTRAINT "DayOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskCompetencias" ADD CONSTRAINT "_TaskCompetencias_A_fkey" FOREIGN KEY ("A") REFERENCES "Competency"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TaskCompetencias" ADD CONSTRAINT "_TaskCompetencias_B_fkey" FOREIGN KEY ("B") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
