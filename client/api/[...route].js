// client/api/[...route].js
// Make sure this file is inside "client/api/"
// Forces Node runtime (so 'pg' works)
export const config = { runtime: 'nodejs' };

import pg from "pg";
const { Pool } = pg;

// Reuse pool across invocations
const pool = global._pgPool || new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon needs SSL
});
if (!global._pgPool) global._pgPool = pool;

// -------- helpers ----------
function json(res, status, body, extraHeaders = {}) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.status(status).send(JSON.stringify(body));
}

const dateEventsSQL = `
  SELECT patient_id, DATE(created_at) AS d FROM encounters
  UNION ALL
  SELECT patient_id, visit_date::date AS d FROM treatments
`;
const lastDatePerPatientSQL = `
  SELECT patient_id, MAX(d) AS last_date
  FROM (${dateEventsSQL}) ev
  GROUP BY patient_id
`;

// Build clean path from catch-all
const pathFromReq = (req) => {
  const segs = Array.isArray(req.query?.route) ? req.query.route : [];
  const p = "/" + segs.join("/");
  return p === "/" ? p : p.replace(/\/+$/, "");
};

export default async function handler(req, res) {
  // CORS & preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const path = pathFromReq(req);
  const qs = req.query || {};

  try {
    // ---- health
    if (path === "/health") return json(res, 200, { ok: true });

    if (path === "/health/db") {
      const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM patients");
      return json(res, 200, { ok: true, patients: rows[0]?.n ?? 0 });
    }

    // ---- billing settings
    if (path === "/billing/settings") {
      const { rows } = await pool.query(
        `SELECT currency, require_prepayment, consultation_fee
           FROM billing_settings
           LIMIT 1`
      );
      const row =
        rows[0] || { currency: "USD", require_prepayment: false, consultation_fee: 0 };
      return json(res, 200, {
        currency: row.currency,
        requirePrepayment: row.require_prepayment,
        consultationFee: Number(row.consultation_fee || 0),
      });
    }

    // ---- patients counts
    if (path === "/patients/counts") {
      const date = qs.date || new Date().toISOString().slice(0, 10);

      const { rows: rToday } = await pool.query(
        `SELECT COUNT(DISTINCT patient_id)::int AS c
           FROM (${dateEventsSQL}) ev
          WHERE ev.d = CURRENT_DATE`
      );
      const { rows: rDate } = await pool.query(
        `SELECT COUNT(DISTINCT patient_id)::int AS c
           FROM (${dateEventsSQL}) ev
          WHERE ev.d = $1::date`,
        [date]
      );
      const { rows: rAll } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM patients`
      );

      return json(res, 200, {
        today: rToday[0].c,
        date: rDate[0].c,
        all: rAll[0].c,
      });
    }

    // ---- patients list/search
    if (path === "/patients") {
      const today  = qs.today === "true";
      const date   = qs.date;
      const search = qs.search;

      const BASE = `
        SELECT
          p.patient_id          AS "patientId",
          p.first_name          AS "firstName",
          p.last_name           AS "lastName",
          p.age,
          p.gender,
          p.village,
          ld.last_date          AS "lastEncounterDate",
          p.created_at          AS "createdAt"
        FROM patients p
        LEFT JOIN (${lastDatePerPatientSQL}) ld
          ON ld.patient_id = p.patient_id
      `;

      let sql = "";
      let params = [];

      if (today) {
        sql = `
          ${BASE}
          WHERE EXISTS (
            SELECT 1 FROM (${dateEventsSQL}) ev
            WHERE ev.patient_id = p.patient_id AND ev.d = CURRENT_DATE
          )
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
        `;
      } else if (date) {
        sql = `
          ${BASE}
          WHERE EXISTS (
            SELECT 1 FROM (${dateEventsSQL}) ev
            WHERE ev.patient_id = p.patient_id AND ev.d = $1::date
          )
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
        `;
        params = [date];
      } else if (search) {
        sql = `
          ${BASE}
          WHERE p.patient_id ILIKE $1
             OR p.first_name ILIKE $1
             OR p.last_name  ILIKE $1
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
          LIMIT 500
        `;
        params = [`%${search}%`];
      } else {
        sql = `
          ${BASE}
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
          LIMIT 500
        `;
      }

      const { rows } = await pool.query(sql, params);
      const out = rows.map((r) => ({
        ...r,
        serviceStatus: { balance: 0, balanceToday: 0 },
      }));
      return json(res, 200, out);
    }

    // Not found
    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    return json(res, 500, { error: "Server error", detail: String(err?.message || err) });
  }
}
