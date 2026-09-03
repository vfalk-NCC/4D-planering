const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "4dplan.sqlite"));

db.exec(`
  CREATE TABLE IF NOT EXISTS plan_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    model_id TEXT,
    object_id TEXT NOT NULL,
    area TEXT,
    activity TEXT,
    contractor TEXT,
    status TEXT DEFAULT 'planerad',
    start_date TEXT,
    end_date TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project_id, object_id)
  );

  CREATE INDEX IF NOT EXISTS idx_plan_items_project ON plan_items(project_id);
`);

function upsertItem(item) {
  const stmt = db.prepare(`
    INSERT INTO plan_items (project_id, model_id, object_id, area, activity, contractor, status, start_date, end_date, updated_at)
    VALUES (@projectId, @modelId, @objectId, @area, @activity, @contractor, @status, @startDate, @endDate, datetime('now'))
    ON CONFLICT(project_id, object_id) DO UPDATE SET
      model_id = excluded.model_id,
      area = excluded.area,
      activity = excluded.activity,
      contractor = excluded.contractor,
      status = excluded.status,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      updated_at = datetime('now')
  `);
  stmt.run(item);
}

function upsertMany(items) {
  const tx = db.transaction((rows) => rows.forEach(upsertItem));
  tx(items);
}

function getItemsForProject(projectId) {
  return db.prepare(`SELECT * FROM plan_items WHERE project_id = ?`).all(projectId)
    .map(row => ({
      id: row.id,
      projectId: row.project_id,
      modelId: row.model_id,
      objectId: row.object_id,
      area: row.area,
      activity: row.activity,
      contractor: row.contractor,
      status: row.status,
      startDate: row.start_date,
      endDate: row.end_date,
      updatedAt: row.updated_at
    }));
}

function deleteItem(projectId, objectId) {
  db.prepare(`DELETE FROM plan_items WHERE project_id = ? AND object_id = ?`).run(projectId, objectId);
}

module.exports = { upsertItem, upsertMany, getItemsForProject, deleteItem };
