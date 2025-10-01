// netlify/functions/api.mjs
// ESM version (your package.json has "type":"module")
import pg from "pg";
const { Pool } = pg;

// --- DB pool (Neon) ---------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // set in Netlify env
  ssl: { rejectUnauthorized: false },         // Neon requires SSL
});

// --- helpers -----------------------------------------------------------------
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

// Subquery that yields one row per service interaction date per patient.
// We UNION encounters.created_at::date and treatments.visit_date::date.
// If one of these tables has no rows, the UNION still works.
const DATE_EVENTS = `
  (
    SELECT patient_id, DATE(created_at) AS d FROM encounters
    UNION ALL
    SELECT patient_id, visit_date::date AS d FROM treatments
  )
`;

// Derived "latest date of service" per patient
const LAST_DATE_PER_PATIENT = `
  SELECT patient_id, MAX(d) AS last_date
  FROM ${DATE_EVENTS} ev
  GROUP BY patient_id
`;

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

    // Optional DB check (how many patients we see)
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

      return json(200, {
        currency: row.currency,
        requirePrepayment: row.require_prepayment,
        consultationFee: Number(row.consultation_fee || 0),
      });
    }

    // --------------------------------------------------------------- counts API
    if (path === "/patients/counts") {
      const date = qs.date || new Date().toISOString().slice(0, 10);

      // Count distinct patients who had an event on given dates
      const { rows: rToday } = await pool.query(
        `SELECT COUNT(DISTINCT patient_id)::int AS c
           FROM ${DATE_EVENTS} ev
          WHERE ev.d = CURRENT_DATE`
      );
      const { rows: rDate } = await pool.query(
        `SELECT COUNT(DISTINCT patient_id)::int AS c
           FROM ${DATE_EVENTS} ev
          WHERE ev.d = $1::date`,
        [date]
      );
      const { rows: rAll } = await pool.query(`SELECT COUNT(*)::int AS c FROM patients`);

      return json(200, {
        today: rToday[0].c,
        date: rDate[0].c,
        all: rAll[0].c,
      });
    }

    // ----------------------------------------------------------- patients list
    if (path === "/patients") {
      const today = qs.today === "true";
      const date  = qs.date;
      const search = qs.search;

      // Base select of patient fields + their last date of service (if any)
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
        LEFT JOIN (${LAST_DATE_PER_PATIENT}) ld
          ON ld.patient_id = p.patient_id
      `;

      let sql, params = [];

      if (today) {
        // patients who had an event today
        sql = `
          ${BASE}
          WHERE EXISTS (
            SELECT 1 FROM ${DATE_EVENTS} ev
            WHERE ev.patient_id = p.patient_id AND ev.d = CURRENT_DATE
          )
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
        `;
      } else if (date) {
        // patients who had an event on a specific date
        sql = `
          ${BASE}
          WHERE EXISTS (
            SELECT 1 FROM ${DATE_EVENTS} ev
            WHERE ev.patient_id = p.patient_id AND ev.d = $1::date
          )
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
        `;
        params = [date];
      } else if (search) {
        // name/id search
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
        // all patients with their latest date (if any)
        sql = `
          ${BASE}
          ORDER BY ld.last_date DESC NULLS LAST, p.created_at DESC
          LIMIT 500
        `;
      }

      const { rows } = await pool.query(sql, params);

      // Your UI expects a serviceStatus object. Add a minimal one.
      const out = rows.map((r) => ({
        ...r,
        serviceStatus: { balance: 0, b
