/**
 * API Express héritée (même logique que mon-premier-projet/server.js), sans fichiers statiques.
 * À lancer sur le port 3001 — Next.js (3000) proxifie /api/* via rewrites.
 */
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local"), override: true });

const documentService = require("./services/documentService");
const authService = require("./services/authService");
const { initDatabase } = require("./services/database");
const { runWebfleetMigrations } = require('./services/webfleet-migrations');
const { startWebfleetCronJobs } = require("./server/jobs/webfleetSync");
const { verifierRappelsVisitesMedicales } = require("./server/jobs/visitesMedicalesRappels");
const wexRoutes = require("./routes/wex");
const webfleetRoutes = require("./server/routes/webfleet");
const ticpeRouter = require("./server/routes/ticpe");
const fecRouter = require("./server/routes/fec");
const rhRoutes = require("./routes/rh");
const exploitationRoutes = require("./routes/exploitation");
const madRoutes = require("./routes/mad");
const salesforceRoutes = require("./routes/salesforce");
const authRoutes = require("./routes/auth");
const directionRoutes = require("./routes/direction");
const savRoutes = require("./routes/sav");
const notificationsRoutes = require("./routes/notifications");
const absencesActionsRoutes = require("./routes/absences-actions");
const flotteRoutes = require("./routes/flotte");
const rentabiliteRoutes = require("./routes/rentabilite");
const dashboardGroupeRoutes = require("./routes/dashboard-groupe");
const referentielRoutes = require("./routes/referentiel");

const app = express();
const PORT = Number(process.env.API_PORT || process.env.LEGACY_API_PORT || 3001);

const nextOrigin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

app.use(
  cors({
    origin: [nextOrigin, /^http:\/\/localhost:\d+$/],
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/api/wex", wexRoutes);
app.use("/api/webfleet", webfleetRoutes);
app.use("/api/ticpe", ticpeRouter);
app.use("/api/fec", fecRouter);
app.use("/api", rhRoutes);
app.use("/api", exploitationRoutes);
app.use("/api", madRoutes);
app.use("/api", salesforceRoutes);
app.use("/api", authRoutes);
app.use("/api", directionRoutes);
app.use("/api", savRoutes);
app.use("/api", notificationsRoutes);
app.use("/api", absencesActionsRoutes);
app.use("/api", flotteRoutes);
app.use("/api/rentabilite", rentabiliteRoutes);
app.use("/api", dashboardGroupeRoutes);
app.use("/api", referentielRoutes);
app.use("/uploads", express.static(documentService.UPLOAD_DIR));
if (!fs.existsSync(path.join(__dirname, "..", "uploads"))) {
  fs.mkdirSync(path.join(__dirname, "..", "uploads"), { recursive: true });
}

app.use((err, req, res, next) => {
  console.error("[legacy-api] Erreur:", err);
  res.status(500).json({ error: err.message || "Erreur serveur" });
});

setInterval(verifierRappelsVisitesMedicales, 5 * 60 * 1000);
verifierRappelsVisitesMedicales();

async function startServer() {
  try {
    await initDatabase();
    await runWebfleetMigrations();
    await authService.seedAdminIfEmpty();
  } catch (err) {
    console.error("[legacy-api][DB] Initialisation PostgreSQL :", err?.message || err);
  }
  try {
    startWebfleetCronJobs();
  } catch (wfErr) {
    console.warn("[legacy-api][Webfleet] Jobs :", wfErr?.message || wfErr);
  }

  app.listen(PORT, "0.0.0.0", async () => {
    console.log(`[legacy-api] PostgreSQL + routes actives — http://127.0.0.1:${PORT}`);
    try {
      await rentabiliteRoutes.purgeCacheTournees();
      console.log("[legacy-api][RENTABILITE] Cache tournées purgé au démarrage");
    } catch (err) {
      console.warn("[legacy-api][RENTABILITE] Purge cache :", err?.message || err);
    }
  });
}

startServer();
