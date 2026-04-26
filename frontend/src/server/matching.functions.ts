import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query } from "@/integrations/db/client.server";
import { requireAuth } from "@/integrations/db/session.server";

const MATCHING_BACKEND_URL =
  process.env.MATCHING_BACKEND_URL ||
  process.env.VITE_MATCHING_BACKEND_URL ||
  "http://localhost:8000";

const SKILL_BACKEND_URL =
  process.env.SKILL_BACKEND_URL || process.env.VITE_SKILL_BACKEND_URL || "http://localhost:2024";

const MatchingRunInputSchema = z.object({
  country: z.string().min(2).max(3),
  sex: z.enum(["male", "female", "total"]).nullable().optional(),
  region: z.string().nullable().optional(),
  reference_year: z.number().int().min(1900).max(2100).nullable().optional(),
  top_k: z.number().int().min(1).max(200).default(20),
  include_hierarchy: z.boolean().default(true),
  hierarchy_decay: z.number().min(0).max(1).default(0.6),
  related_decay: z.number().min(0).max(1).default(0.5),
});

export type MatchingRunInput = z.infer<typeof MatchingRunInputSchema>;

export type OccupationResult = {
  occupation_uri: string;
  occupation_label: string | null;
  base_skill_score: number;
  essential_coverage: number;
  optional_coverage: number;
  matched_essential_count: number;
  total_essential_count: number;
  matched_optional_count: number;
  total_optional_count: number;
  matched_input_skills: string[];
  missing_essential_skills: string[];
  earnings_value_local: number | null;
  occupation_demand_level: number | null;
  occupation_unemployment_risk: number | null;
  hours_worked: number | null;
  informality_rate: number | null;
};

export type MatchingRunResult = {
  context: {
    country: string;
    sex: string | null;
    region: string | null;
    reference_year: number | null;
    top_k: number;
  };
  occupations: OccupationResult[];
  /**
   * Map of ESCO skill URI -> preferred English label, covering every URI
   * referenced in `occupations[].matched_input_skills` /
   * `occupations[].missing_essential_skills` and every input skill URI. Used
   * by the UI to display human-readable skill names instead of UUIDs.
   */
  skill_labels: Record<string, string>;
  /** Skills from the user's profile (DuckDB user_skills). */
  profile_skill_count: number;
  /** Skills successfully mapped to an ESCO concept URI. */
  skill_count: number;
};

const proficiencyToScore: Record<string, number> = {
  beginner: 0.25,
  intermediate: 0.5,
  advanced: 0.75,
  expert: 1.0,
};

async function resolveConceptUri(skillName: string): Promise<string | null> {
  try {
    const response = await fetch(`${SKILL_BACKEND_URL}/skills/manual-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: skillName, limit: 1 }),
    });
    if (!response.ok) return null;
    const json = await response.json();
    const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
    if (candidates.length === 0) return null;
    const uri = candidates[0]?.concept_uri;
    return typeof uri === "string" && uri ? uri : null;
  } catch {
    return null;
  }
}

export const runMatching = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => MatchingRunInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const rows = await query<{
      proficiency: string | null;
      llm_level: string | null;
      name: string;
    }>(
      `SELECT us.proficiency, us.llm_level, s.name
       FROM user_skills us JOIN skills s ON s.id = us.skill_id
       WHERE us.user_id = $user_id`,
      { user_id: userId },
    );

    const resolvedSkills = await Promise.all(
      rows.map(async (row) => {
        if (!row.name) return null;
        const uri = await resolveConceptUri(row.name);
        if (!uri) return null;
        const levelKey = (row.llm_level || row.proficiency || "intermediate").toLowerCase();
        const score = proficiencyToScore[levelKey] ?? 0.5;
        return { uri, score };
      }),
    );

    const skills: Record<string, number> = {};
    for (const entry of resolvedSkills) {
      if (entry) skills[entry.uri] = entry.score;
    }

    const body = {
      skills,
      country: data.country.toUpperCase(),
      sex: data.sex ?? null,
      region: data.region ?? null,
      reference_year: data.reference_year ?? null,
      top_k: data.top_k,
      include_hierarchy: data.include_hierarchy,
      hierarchy_decay: data.hierarchy_decay,
      related_decay: data.related_decay,
    };

    const response = await fetch(`${MATCHING_BACKEND_URL}/api/v1/matching/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const txt = await response.text();
      throw new Error(`Matching API error ${response.status}: ${txt}`);
    }

    const result = (await response.json()) as {
      context: MatchingRunResult["context"];
      occupations: OccupationResult[];
      skill_labels?: Record<string, string>;
    };
    return {
      ...result,
      skill_labels: result.skill_labels ?? {},
      profile_skill_count: rows.length,
      skill_count: Object.keys(skills).length,
    } as MatchingRunResult;
  });
