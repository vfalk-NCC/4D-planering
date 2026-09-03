const express = require("express");
const cors = require("cors");
const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

/**
 * Hämta alla planeringsposter för ett Trimble Connect-projekt.
 * Extensionen anropar denna vid start och efter varje ändring.
 */
app.get("/api/projects/:projectId/items", (req, res) => {
  const items = db.getItemsForProject(req.params.projectId);
  res.json(items);
});

/**
 * Skapa/uppdatera flera poster samtidigt (används både när användaren
 * kopplar en markering i modellen och vid Excel-import).
 * Body: { items: [{ projectId, modelId, objectId, area, activity,
 *                    contractor, status, startDate, endDate }, ...] }
 */
app.post("/api/projects/:projectId/items/bulk", (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "items måste vara en array" });
  }
  const normalized = items
    .filter(it => it.objectId)
    .map(it => ({
      projectId: req.params.projectId,
      modelId: it.modelId || null,
      objectId: String(it.objectId),
      area: it.area || null,
      activity: it.activity || null,
      contractor: it.contractor || null,
      status: it.status || "planerad",
      startDate: it.startDate || null,
      endDate: it.endDate || null
    }));

  db.upsertMany(normalized);
  res.json({ updated: normalized.length, items: db.getItemsForProject(req.params.projectId) });
});

/** Ta bort en enskild post (t.ex. om ett objekt tas bort ur planeringen). */
app.delete("/api/projects/:projectId/items/:objectId", (req, res) => {
  db.deleteItem(req.params.projectId, req.params.objectId);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`4D-planeringsserver igång på port ${PORT}`));
