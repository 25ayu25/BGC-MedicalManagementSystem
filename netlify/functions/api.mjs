// netlify/functions/api.mjs  (ESM because package.json has "type":"module")
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function reply(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event) {
  const path = event.path.replace("/.netlify/functions/api", "");
  const qs = event.queryStringParameters || {};

  try {
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

    if (path === "/health") return reply(200, { ok: true });

    // --- Billing settings ----------------------------------------------------
    if (path === "/billing/settings") {
      const { rows } = await pool.query(
        `select currency, require_prepayment, consultation_fee
         from billing_settings
         limit 1`
      );
      const row =
        rows[0] || { currency: "USD", require_prepayment: false, consultation_fee: 0 };
      return reply(200, {
        currency: row.currency,
        requirePrepayment: row.require_prepayment,
        consultationFee: Number(row.consultation_fee || 0),
      });
    }

    // --- Patient counts ------------------------------------------------------
    if (path === "/patients/counts") {
      const date = qs.date || new Date().toISOString().slice(0, 10);
      const { rows: r1 } = await pool.query(
        `select count(*)::int as c
         from patients
         where last_encounter_date = current_date`
      );
      const { rows: r2 } = await pool.query(
        `select count(*)::int as c
         from patients
         where last_encounter_date = $1::date`,
        [date]
      );
      const { rows: r3 } = await pool.query(
        `select count(*)::int as c from patients`
      );
      return reply(200, { today: r1[0].c, date: r2[0].c, all: r3[0].c });
    }

    // --- Patients list / search (aliases match your UI exactly) -------------
    if (path === "/patients") {
      const today = qs.today === "true";
      const date = qs.date;
      const search = qs.search;

      const baseSelect = `
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

      let sql = "";
      let params = [];

      if (today) {
        sql = `${baseSelect}
               where last_encounter_date = current_date
               order by last_encounter_date desc nulls last, created_at desc`;
      } else if (date) {
        sql = `${baseSelect}
               where last_encounter_date = $1::date
               order by last_encounter_date desc nulls last, created_at desc`;
        params = [date];
      } else if (search) {
        sql = `${baseSelect}
               where patient_id ilike $1 or first_name ilike $1 or last_name ilike $1
               order by last_encounter_date desc nulls last, created_at desc`;
        params = [`%${search}%`];
      } else {
        sql = `${baseSelect}
               order by last_encounter_date desc nulls last, created_at desc
               limit 500`;
      }

      const { rows } = await pool.query(sql, params);

      // add the status object your table expects
      const out = rows.map((r) => ({
        ...r,
        serviceStatus: { balance: 0, balanceToday: 0 },
      }));
      return reply(200, out);
    }

    return reply(404, { error: "Not found" });
  } catch (e) {
    console.error("API error:", e);
    return reply(500, { error: "Server error", detail: String(e.message || e) });
  }
}
