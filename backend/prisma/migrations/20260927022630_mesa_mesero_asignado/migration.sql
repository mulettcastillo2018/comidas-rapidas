-- AlterTable
ALTER TABLE "Mesa" ADD COLUMN     "meseroAsignadoId" TEXT;

-- AddForeignKey
ALTER TABLE "Mesa" ADD CONSTRAINT "Mesa_meseroAsignadoId_fkey" FOREIGN KEY ("meseroAsignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
