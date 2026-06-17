import { z } from 'zod';
import { Application } from 'express';

interface LakebaseClient {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

interface Appkit {
  lakebase: LakebaseClient & {
    asUser(req: import('express').Request): LakebaseClient;
  };
  server: {
    extend(fn: (app: Application) => void): void;
  };
}

// Synced tables land in the public schema once DLT pipelines finish.
// They are read-only (INSERT/UPDATE/DELETE will corrupt the pipeline).
// Shortlist uses a separate table in public schema; DDL uses a 5s timeout to avoid DLT lock hangs.

function parseReferralQuery(q: string): { careNeed: string; location: string | null; pincode: string | null } {
  const trimmed = q.trim();
  const pincodeMatch = trimmed.match(/\b(\d{6})\b/);
  if (pincodeMatch) {
    const careNeed = trimmed.replace(pincodeMatch[0], '').replace(/\s+/g, ' ').trim();
    return { careNeed, location: null, pincode: pincodeMatch[1] };
  }
  const nearMatch = trimmed.match(/^(.+?)\s+(?:near|in|at)\s+(.+)$/i);
  if (nearMatch) {
    return { careNeed: nearMatch[1].trim(), location: nearMatch[2].trim(), pincode: null };
  }
  return { careNeed: trimmed, location: null, pincode: null };
}

interface ScoredFacility {
  unique_id: string;
  name: string;
  address_city: string | null;
  address_stateOrRegion: string | null;
  officialPhone: string | null;
  specialties: string | null;
  description: string | null;
  capability: string | null;
  procedure: string | null;
  equipment: string | null;
  numberDoctors: string | null;
  capacity: string | null;
  latitude: number;
  longitude: number;
  distance_km: number;
  match_score: number;
  evidence: string[];
  missing_fields: string[];
}

function scoreRows(rows: Record<string, unknown>[], careNeed: string): ScoredFacility[] {
  const cn = careNeed.toLowerCase();
  const keywords = cn.split(/[\s,]+/).filter((k) => k.length > 2);

  return rows.map((row) => {
    const fieldWeights: Array<[string, number]> = [
      ['capability', 3],
      ['procedure', 2],
      ['equipment', 2],
      ['specialties', 2],
      ['description', 1],
    ];

    let score = 0;
    const evidence: string[] = [];
    const missing: string[] = [];

    for (const [field, weight] of fieldWeights) {
      const raw = row[field];
      if (!raw || raw === 'null') {
        missing.push(field);
        continue;
      }
      const text = String(raw);
      const lower = text.toLowerCase();

      if (lower.includes(cn)) {
        score += weight * 2;
        const idx = lower.indexOf(cn);
        const start = Math.max(0, idx - 30);
        const end = Math.min(text.length, idx + cn.length + 60);
        evidence.push(`${field}: "…${text.slice(start, end)}…"`);
      } else {
        const hit = keywords.find((k) => lower.includes(k));
        if (hit) {
          score += weight;
          const idx = lower.indexOf(hit);
          const start = Math.max(0, idx - 20);
          const end = Math.min(text.length, idx + hit.length + 60);
          evidence.push(`${field}: "…${text.slice(start, end)}…"`);
        }
      }
    }

    return {
      unique_id: String(row['unique_id'] ?? ''),
      name: String(row['name'] ?? ''),
      address_city: row['address_city'] != null ? String(row['address_city']) : null,
      address_stateOrRegion: row['address_stateOrRegion'] != null ? String(row['address_stateOrRegion']) : null,
      officialPhone: row['officialPhone'] != null ? String(row['officialPhone']) : null,
      specialties: row['specialties'] != null ? String(row['specialties']) : null,
      description: row['description'] != null ? String(row['description']) : null,
      capability: row['capability'] != null ? String(row['capability']) : null,
      procedure: row['procedure'] != null ? String(row['procedure']) : null,
      equipment: row['equipment'] != null ? String(row['equipment']) : null,
      numberDoctors: row['numberDoctors'] != null ? String(row['numberDoctors']) : null,
      capacity: row['capacity'] != null ? String(row['capacity']) : null,
      latitude: Number(row['latitude']),
      longitude: Number(row['longitude']),
      distance_km: Math.round(Number(row['distance_km']) * 10) / 10,
      match_score: score,
      evidence,
      missing_fields: missing,
    };
  });
}

const ShortlistBody = z.object({
  facility_id: z.string().min(1),
  facility_name: z.string().min(1),
  facility_city: z.string().optional(),
  facility_state: z.string().optional(),
  facility_phone: z.string().optional(),
  note: z.string().max(500).optional(),
  distance_km: z.number().optional(),
  match_score: z.number().int().optional(),
});

// SP has no CREATE TABLE privilege; OBO user (shubhanshijain05) is DATABRICKS_SUPERUSER.
// ensureShortlist creates the table lazily on first request via the OBO connection.
async function ensureShortlist(db: LakebaseClient) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS public.shortlist (
      id SERIAL PRIMARY KEY,
      facility_id TEXT NOT NULL,
      facility_name TEXT NOT NULL,
      facility_city TEXT,
      facility_state TEXT,
      facility_phone TEXT,
      note TEXT,
      distance_km NUMERIC(8,2),
      match_score INTEGER DEFAULT 0,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function setupReferralRoutes(appkit: Appkit) {

  appkit.server.extend((app) => {
    // ── Facilities ────────────────────────────────────────────────────────────

    app.get('/api/facilities', async (req, res) => {
      try {
        const { q, state, specialty, limit = '30', offset = '0' } = req.query as Record<string, string>;
        const params: unknown[] = [];
        const conditions: string[] = [];

        if (q) {
          params.push(`%${q}%`);
          conditions.push(`(f.name ILIKE $${params.length} OR f.description ILIKE $${params.length})`);
        }
        if (state) {
          params.push(state);
          conditions.push(`f."address_stateOrRegion" = $${params.length}`);
        }
        if (specialty) {
          params.push(`%${specialty}%`);
          conditions.push(`f.specialties ILIKE $${params.length}`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const lim = Math.min(parseInt(limit, 10) || 30, 100);
        const off = parseInt(offset, 10) || 0;

        const result = await appkit.lakebase.query(
          `SELECT
            f.unique_id,
            f.name,
            f.organization_type,
            f."address_city",
            f."address_stateOrRegion",
            f."address_zipOrPostcode",
            f.specialties,
            f.capacity,
            f."numberDoctors",
            f.latitude,
            f.longitude,
            f.email,
            f."officialWebsite"
          FROM public.facilities f
          ${where}
          ORDER BY f.name
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, lim, off],
        );

        const countResult = await appkit.lakebase.query(
          `SELECT COUNT(*) AS total FROM public.facilities f ${where}`,
          params,
        );

        res.json({
          facilities: result.rows,
          total: parseInt(String(countResult.rows[0]?.total ?? 0), 10),
          limit: lim,
          offset: off,
        });
      } catch (err) {
        console.error('Failed to list facilities:', err);
        res.status(500).json({ error: 'Failed to list facilities' });
      }
    });

    app.get('/api/facilities/:id', async (req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT
            unique_id, name, organization_type, description,
            "address_line1", "address_line2", "address_city",
            "address_stateOrRegion", "address_zipOrPostcode", "address_country",
            specialties, capacity, "numberDoctors", procedure, equipment,
            "facilityTypeId", "operatorTypeId",
            latitude, longitude, email, "officialWebsite",
            phone_numbers, "officialPhone",
            "yearEstablished", "acceptsVolunteers"
          FROM public.facilities
          WHERE unique_id = $1`,
          [req.params.id],
        );
        if (result.rows.length === 0) {
          res.status(404).json({ error: 'Facility not found' });
          return;
        }
        res.json(result.rows[0]);
      } catch (err) {
        console.error('Failed to get facility:', err);
        res.status(500).json({ error: 'Failed to get facility' });
      }
    });

    app.get('/api/facilities/states/list', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT DISTINCT "address_stateOrRegion" AS state
           FROM public.facilities
           WHERE "address_stateOrRegion" IS NOT NULL AND "address_stateOrRegion" != ''
           ORDER BY "address_stateOrRegion"
           LIMIT 100`,
        );
        res.json(result.rows.map((r) => String(r.state)));
      } catch (err) {
        console.error('Failed to list states:', err);
        res.status(500).json({ error: 'Failed to list states' });
      }
    });

    // ── Health Indicators ─────────────────────────────────────────────────────

    app.get('/api/health-indicators', async (req, res) => {
      try {
        const { state, district } = req.query as Record<string, string>;
        const params: unknown[] = [];
        const conditions: string[] = [];

        if (state) {
          params.push(state);
          conditions.push(`state_ut ILIKE $${params.length}`);
        }
        if (district) {
          params.push(`%${district}%`);
          conditions.push(`district_name ILIKE $${params.length}`);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const result = await appkit.lakebase.query(
          `SELECT
            district_name,
            state_ut,
            institutional_birth_5y_pct,
            births_attended_by_skilled_hp_5y_10_pct,
            hh_member_covered_health_insurance_pct,
            hh_improved_water_pct,
            hh_use_improved_sanitation_pct,
            households_using_clean_fuel_for_cooking_pct,
            women_age_15_49_who_are_literate_pct,
            fp_cm_w15_49_modern_method_pct,
            households_surveyed
          FROM public.nfhs_5_district_health_indicators
          ${where}
          ORDER BY state_ut, district_name
          LIMIT 200`,
          params,
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to get health indicators:', err);
        res.status(500).json({ error: 'Failed to get health indicators' });
      }
    });

    app.get('/api/health-indicators/states/list', async (_req, res) => {
      try {
        const result = await appkit.lakebase.query(
          `SELECT DISTINCT state_ut FROM public.nfhs_5_district_health_indicators
           WHERE state_ut IS NOT NULL ORDER BY state_ut LIMIT 50`,
        );
        res.json(result.rows.map((r) => String(r.state_ut)));
      } catch (err) {
        console.error('Failed to list indicator states:', err);
        res.status(500).json({ error: 'Failed to list indicator states' });
      }
    });

    // ── Pincode Lookup ────────────────────────────────────────────────────────

    app.get('/api/pincode/:code', async (req, res) => {
      try {
        const pin = req.params.code.replace(/\D/g, '');
        if (pin.length !== 6) {
          res.status(400).json({ error: 'Pincode must be 6 digits' });
          return;
        }
        const result = await appkit.lakebase.query(
          `SELECT officename, officetype, delivery, district, statename,
                  pincode, latitude, longitude, circlename, divisionname
           FROM public.india_post_pincode_directory
           WHERE pincode = $1
           ORDER BY officetype, officename
           LIMIT 50`,
          [parseInt(pin, 10)],
        );
        res.json(result.rows);
      } catch (err) {
        console.error('Failed to lookup pincode:', err);
        res.status(500).json({ error: 'Failed to lookup pincode' });
      }
    });

    // ── Referral Search ───────────────────────────────────────────────────────

    app.post('/api/referral-search', async (req, res) => {
      try {
        const { query } = req.body as { query?: string };
        if (!query?.trim()) {
          res.status(400).json({ error: 'Query is required' });
          return;
        }

        const parsed = parseReferralQuery(query);
        if (!parsed.careNeed) {
          res.status(400).json({ error: 'Please include a care need (e.g. "dialysis near Jaipur")' });
          return;
        }

        let lat: number | null = null;
        let lon: number | null = null;
        let resolvedLocation = '';

        if (parsed.pincode) {
          const r = await appkit.lakebase.query(
            `SELECT AVG(NULLIF(latitude, '')::float) AS lat, AVG(NULLIF(longitude, '')::float) AS lon
             FROM public.india_post_pincode_directory WHERE pincode = $1`,
            [parseInt(parsed.pincode, 10)],
          );
          if (r.rows[0]?.lat != null) {
            lat = Number(r.rows[0].lat);
            lon = Number(r.rows[0].lon);
            resolvedLocation = `Pincode ${parsed.pincode}`;
          }
        } else if (parsed.location) {
          const exact = await appkit.lakebase.query(
            `SELECT AVG(NULLIF(latitude, '')::float) AS lat, AVG(NULLIF(longitude, '')::float) AS lon
             FROM public.india_post_pincode_directory WHERE UPPER(district) = UPPER($1)`,
            [parsed.location],
          );
          if (exact.rows[0]?.lat != null) {
            lat = Number(exact.rows[0].lat);
            lon = Number(exact.rows[0].lon);
            resolvedLocation = parsed.location;
          } else {
            const partial = await appkit.lakebase.query(
              `SELECT AVG(NULLIF(latitude, '')::float) AS lat, AVG(NULLIF(longitude, '')::float) AS lon,
                      MAX(district) AS district
               FROM public.india_post_pincode_directory WHERE UPPER(district) LIKE UPPER($1)`,
              [`%${parsed.location}%`],
            );
            if (partial.rows[0]?.lat != null) {
              lat = Number(partial.rows[0].lat);
              lon = Number(partial.rows[0].lon);
              resolvedLocation = String(partial.rows[0].district ?? parsed.location);
            }
          }
        }

        if (lat == null || lon == null) {
          const hint = parsed.location
            ? `Location "${parsed.location}" not found. Try a district name (e.g. "Jaipur") or a 6-digit pincode.`
            : 'Add a location using "near <city>" or include a 6-digit pincode.';
          res.status(400).json({ error: hint });
          return;
        }

        const facilityResult = await appkit.lakebase.query(
          `SELECT * FROM (
            SELECT
              f.unique_id,
              f.name,
              f."address_city",
              f."address_stateOrRegion",
              f."officialPhone",
              f.specialties,
              f.description,
              f.capability,
              f.procedure,
              f.equipment,
              f."numberDoctors",
              f.capacity,
              f.latitude,
              f.longitude,
              (2 * 6371 * asin(sqrt(
                power(sin(radians((f.latitude::float - $1) / 2)), 2) +
                cos(radians($1)) * cos(radians(f.latitude::float)) *
                power(sin(radians((f.longitude::float - $2) / 2)), 2)
              ))) AS distance_km
            FROM public.facilities f
            WHERE f.latitude IS NOT NULL AND f.longitude IS NOT NULL
              AND f.latitude::text != '' AND f.longitude::text != ''
              AND f.latitude::float != 0 AND f.longitude::float != 0
          ) sub
          WHERE distance_km <= 50
          ORDER BY distance_km
          LIMIT 200`,
          [lat, lon],
        );

        const scored = scoreRows(facilityResult.rows, parsed.careNeed);
        scored.sort((a, b) => {
          const diff = b.match_score - a.match_score;
          return diff !== 0 ? diff : a.distance_km - b.distance_km;
        });

        res.json({
          results: scored.slice(0, 20),
          total_in_radius: facilityResult.rows.length,
          resolved_location: resolvedLocation,
          care_need: parsed.careNeed,
          center: { lat, lon },
        });
      } catch (err) {
        console.error('Referral search failed:', err);
        res.status(500).json({ error: 'Search failed. Please try again.' });
      }
    });

    // ── Shortlist ─────────────────────────────────────────────────────────────

    app.get('/api/shortlist', async (req, res) => {
      try {
        const db = appkit.lakebase.asUser(req);
        await ensureShortlist(db);
        const r = await db.query('SELECT * FROM public.shortlist ORDER BY saved_at DESC LIMIT 100');
        res.json(r.rows);
      } catch (err) {
        console.error('Failed to get shortlist:', err);
        res.status(500).json({ error: 'Failed to get shortlist' });
      }
    });

    app.post('/api/shortlist', async (req, res) => {
      try {
        const parsed = ShortlistBody.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ error: 'facility_id and facility_name are required' });
          return;
        }
        const d = parsed.data;
        const db = appkit.lakebase.asUser(req);
        await ensureShortlist(db);
        const r = await db.query(
          `INSERT INTO public.shortlist
            (facility_id, facility_name, facility_city, facility_state, facility_phone, note, distance_km, match_score)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *`,
          [
            d.facility_id,
            d.facility_name,
            d.facility_city ?? null,
            d.facility_state ?? null,
            d.facility_phone ?? null,
            d.note ?? null,
            d.distance_km ?? null,
            d.match_score ?? 0,
          ],
        );
        res.status(201).json(r.rows[0]);
      } catch (err) {
        console.error('Failed to add to shortlist:', err);
        res.status(500).json({ error: 'Failed to add to shortlist' });
      }
    });

    app.delete('/api/shortlist/:id', async (req, res) => {
      try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'Invalid id' });
          return;
        }
        const db = appkit.lakebase.asUser(req);
        const r = await db.query('DELETE FROM public.shortlist WHERE id = $1 RETURNING id', [id]);
        if (r.rows.length === 0) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        res.status(204).send();
      } catch (err) {
        console.error('Failed to remove from shortlist:', err);
        res.status(500).json({ error: 'Failed to remove from shortlist' });
      }
    });

    // ── Stats ─────────────────────────────────────────────────────────────────

    app.get('/api/stats', async (_req, res) => {
      try {
        const [facilityCount, districtCount, pincodeCount] = await Promise.all([
          appkit.lakebase.query('SELECT COUNT(*) AS n FROM public.facilities'),
          appkit.lakebase.query('SELECT COUNT(*) AS n FROM public.nfhs_5_district_health_indicators'),
          appkit.lakebase.query('SELECT COUNT(DISTINCT pincode) AS n FROM public.india_post_pincode_directory'),
        ]);
        res.json({
          facilities: parseInt(String(facilityCount.rows[0]?.n ?? 0), 10),
          districts: parseInt(String(districtCount.rows[0]?.n ?? 0), 10),
          pincodes: parseInt(String(pincodeCount.rows[0]?.n ?? 0), 10),
        });
      } catch (err) {
        console.error('Failed to get stats:', err);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });
  });
}
