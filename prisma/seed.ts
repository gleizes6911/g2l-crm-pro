/**
 * Seed des taux TICPE (table `ticpe_taux`) — alignement legacy.
 * Taux : 2022–2023 = 15,25 c/L ; 2024–2025 = 18,82 c/L.
 */
import { Prisma } from "../src/generated/prisma";

import { prisma } from "../src/lib/prisma";

type SeedRow = {
  carburant_code: string;
  region_code: string | null;
  taux_cents: number;
  date_debut: Date;
  date_fin: Date | null;
  metadata?: Prisma.InputJsonValue;
};

/** Fenêtre annuelle (UTC) pour un taux « national » GO sans région. */
function yearWindow(year: number): { date_debut: Date; date_fin: Date } {
  return {
    date_debut: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    date_fin: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)),
  };
}

/** Textes officiels (code CIBS + JORF) — complétez si votre bloc SQL listait d’autres URL. */
const REFERENCES_LEGIFRANCE = [
  "https://www.legifrance.gouv.fr/codes/id/LEGITEXT000044597533/",
  "https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000051357638",
];

const TICPE_SEED_ROWS: SeedRow[] = [
  {
    carburant_code: "GO",
    region_code: null,
    taux_cents: 15.25,
    ...yearWindow(2022),
    metadata: {
      source: "prisma_seed",
      periodes: "2022",
      references_legifrance: REFERENCES_LEGIFRANCE,
    },
  },
  {
    carburant_code: "GO",
    region_code: null,
    taux_cents: 15.25,
    ...yearWindow(2023),
    metadata: {
      source: "prisma_seed",
      periodes: "2023",
      references_legifrance: REFERENCES_LEGIFRANCE,
    },
  },
  {
    carburant_code: "GO",
    region_code: null,
    taux_cents: 18.82,
    ...yearWindow(2024),
    metadata: {
      source: "prisma_seed",
      periodes: "2024",
      references_legifrance: REFERENCES_LEGIFRANCE,
    },
  },
  {
    carburant_code: "GO",
    region_code: null,
    taux_cents: 18.82,
    ...yearWindow(2025),
    metadata: {
      source: "prisma_seed",
      periodes: "2025",
      references_legifrance: REFERENCES_LEGIFRANCE,
    },
  },
];

async function main() {
  for (const row of TICPE_SEED_ROWS) {
    const exists = await prisma.g2LTicpeTaux.findFirst({
      where: {
        carburant_code: row.carburant_code,
        region_code: row.region_code,
        date_debut: row.date_debut,
      },
    });
    if (exists) continue;

    await prisma.g2LTicpeTaux.create({
      data: {
        carburant_code: row.carburant_code,
        region_code: row.region_code,
        taux_cents: new Prisma.Decimal(row.taux_cents),
        date_debut: row.date_debut,
        date_fin: row.date_fin,
        metadata: row.metadata ?? {},
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
