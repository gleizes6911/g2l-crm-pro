-- AlterTable
ALTER TABLE "g2l_cartes_carburant" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "g2l_transactions_carburant" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "g2l_vehicules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ticpe_taux" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "webfleet_trips" ALTER COLUMN "updated_at" DROP DEFAULT;
