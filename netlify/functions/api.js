// netlify/functions/api.js
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const path = event.path.replace("/.netlify/functions/api", "");
  const qs = event.queryStringParameters || {};

  try {
    if (path === "/health") return json(200, { ok: true });

    if (path === "/billing/settings") {
      const { rows } = await pool.query(
        "select currency, require_prepayment, consultation_fee from billing_settings limit 1"
      );
      const row = rows[0] || { currency: "USD", require_prepayment: false, consultation_fee: 0 };
      return json(200, {
        currency: row.currency,
        requirePrepayment: row.require_prepayment,
        consultationFee: Number(row.consultation_fee || 0),
      });
    }

    if (path === "/patients/counts") {
      const date = qs.date || new Date().toISOString().slice(0, 10);
      const { rows: r1 } = await pool.query(
        "select count(*)::int as c from patients where last_encounter_date = current_date"
      );
      const { rows: r2 } = await pool.query(
        "select count(*)::int as c from patients where last_encounter_date = $1::date",
        [date]
      );
      const { rows: r3 } = await pool.query("select count(*)::int as c from patients");
      return json(200, { today: r1[0].c, date: r2[0].c, all: r3[0].c });
    }

    if (path === "/patients") {
      const today = qs.today === "true";
      const date = qs.date;
      const search = qs.search;
      let rows;

      if (today) {
        ({ rows } = await pool.query(
          `select * from patients
           where last_encounter_date = current_date
           order by last_encounter_date desc nulls last`
        ));
      } else if (date) {
        ({ rows } = await pool.query(
          `select * from patients
           where last_encounter_date = $1::date
           order by last_encounter_date desc nulls last`,
          [date]
        ));
      } else if (search) {
        const term = `%${search}%`;
        ({ rows } = await pool.query(
          `select * from patients
           where patient_id ilike $1 or first_name ilike $1 or last_name ilike $1
           order by last_encounter_date desc nulls last`,
          [term]
        ));
      } else {
        ({ rows } = await pool.query(
          `select * from patients
           order by last_encounter_date desc nulls last
           limit 500`
        ));
      }

      const mapped = rows.map((r) => ({
        patientId: r.patient_id,
        firstName: r.first_name,
        lastName: r.last_name,
        age: r.age,
        gender: r.gender,
        village: r.village,
        lastEncounterDate: r.last_encounter_date,
        createdAt: r.created_at,
        serviceStatus: { balance: 0, balanceToday: 0 },
      }));

      return json(200, mapped);
    }

    return json(404, { error: "Not found" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error", detail: String(e.message || e) });
  }
};
