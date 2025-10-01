// netlify/functions/api.mjs
// ESM version (your package.json has "type":"module")
import pg from "pg";
const { Pool } = pg;

// --- DB pool (Neon) ---------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // set in Netlify env
  ssl: { rejectUnauthorized: false },         // Neon requires SSL
});

// --- tiny helpers ------------------------------------------------------------
const json = (status, body, extraHeaders = {}) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

// Normalise both possible prefixes (/.netlify/functions/api *or* /api)
const normalizePath = (rawPath = "") =>
  rawPath
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api/, "")
    .replace(/\/+$/, "") || "/";

// --- handler -----------------------------------------------------------------
export async function handler(event) {
  const path = normalizePath(event.path);
  const qs = event.queryStringParameters || {};

  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    };
  }

  try {
    // ----------------------------------------------------------------- health
    if (path === "/health") return json(200, { ok: true });

    // Optional: DB sanity check
    if (path === "/health/db") {
      const { rows } = await pool.query("select count(*)::int as n from patients");
      return json(200, { ok: true, patients: rows[0]?.n ?? 0 });
    }

    // --------------------------------------------------------- billing settings
    if (path === "/billing/settings") {
      const { rows } = await pool.query(
        `select currency, require_prepayment, consultation_fee
           from billing_settings
           limit 1`
      );
      const row =
        rows[0] || { currency: "USD", require_prepayment: false, consultation_fee: 0 };

      // map to UI field names
      return json(200, {
        currency: row.currency,
        requirePrepayment: row.require_prepayment,
        consultationFee: Number(row.consultation_fee || 0),
      });
    }

    // --------------------------------------------------------------- counts API
    if (path === "/patients/counts") {
      const date = qs.date || new Date().toISOString().slice(0, 10);

      const { rows: rToday } = await pool.query(
        `select count(*)::int as c
           from patients
          where last_encounter_date = current_date`
      );
      const { rows: rDate } = await pool.query(
        `select count(*)::int as c
           from patients
          where last_encounter_date = $1::date`,
        [date]
      );
      const { rows: rAll } = await pool.query(
        `select count(*)::int as c from patients`
      );

      return json(200, {
        today: rToday[0].c,
        date: rDate[0].c,
        all: rAll[0].c,
      });
    }

    // ----------------------------------------------------------- patients list
    if (path === "/patients") {
      const today = qs.today === "true";
      const date = qs.date;
      const search = qs.search;

      const base = `
        select
          patient_id           as "patientId",
          first_name           as "firstName",
          last_name            as "lastName",
          age,
          gender,
          village,
          last_encounter_date  as "lastEncounterDate",
          created_at           as "createdAt"
        from patients
      `;

      let sql, params;
      if (today) {
        sql = `${base}
               where last_encounter_date = current_date
               order by last_encounter_date desc nulls last, created_at desc`;
        params = [];
      } else if (date) {
        sql = `${base}
               where last_encounter_date = $1::date
               order by last_encounter_date desc nulls last, created_at desc`;
        params = [date];
      } else if (search) {
        sql = `${base}
               where patient_id ilike $1
                  or first_name ilike $1
                  or last_name  ilike $1
               order by last_encounter_date desc nulls last, created_at desc`;
        params = [`%${search}%`];
      } else {
        sql = `${base}
               order by last_encounter_date desc nulls last, created_at desc
               limit 500`;
        params = [];
      }

      const { rows } = await pool.query(sql, params);

      // Add the minimal status fields your table expects
      const out = rows.map((r) => ({
        ...r,
        serviceStatus: { balance: 0, balanceToday: 0 },
      }));

      return json(200, out);
    }

    // -------------------------------------------------------------- not found
    return json(404, { error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    return json(500, { error: "Server error", detail: String(err?.message || err) });
  }
}
