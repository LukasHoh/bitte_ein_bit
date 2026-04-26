/**
 * Server functions for the user profile + region picker.
 *
 * Replaces direct Supabase queries in `/app/profile`. Every mutation requires
 * a valid session via `requireAuth`, which guarantees we only ever read/write
 * the calling user's own row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { execute, query, queryOne } from "@/integrations/db/client.server";
import { requireAuth } from "@/integrations/db/session.server";

export type ProfileRow = {
  id: string;
  full_name: string | null;
  language: string | null;
  region_id: string | null;
  sex: string | null;
  salary_importance: number | null;
  age: number | null;
};

export type RegionRow = {
  id: string;
  name: string;
  country_code: string | null;
};

const ProfileUpsertSchema = z.object({
  full_name: z.string().trim().max(120).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  region_id: z.string().uuid().nullable().optional(),
  sex: z.enum(["male", "female", "diverse"]).nullable().optional(),
  salary_importance: z.number().int().min(1).max(10).nullable().optional(),
  age: z.number().int().min(0).max(120).nullable().optional(),
});

export const listRegions = createServerFn({ method: "GET" }).handler(
  async (): Promise<RegionRow[]> => {
    return query<RegionRow>("SELECT id, name, country_code FROM regions ORDER BY name ASC");
  },
);

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<ProfileRow> => {
    const { userId } = context;
    let row = await queryOne<ProfileRow>(
      `SELECT id, full_name, language, region_id, sex, salary_importance, age
       FROM profiles WHERE id = $id`,
      { id: userId },
    );
    if (!row) {
      await execute(
        `INSERT INTO profiles (id, full_name, language)
         VALUES ($id, $full_name, $language)`,
        { id: userId, full_name: "", language: "en" },
      );
      row = await queryOne<ProfileRow>(
        `SELECT id, full_name, language, region_id, sex, salary_importance, age
         FROM profiles WHERE id = $id`,
        { id: userId },
      );
    }
    if (!row) throw new Error("Failed to load profile");
    return row;
  });

export const upsertProfile = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => ProfileUpsertSchema.parse(input))
  .handler(async ({ data, context }): Promise<ProfileRow> => {
    const { userId } = context;

    const existing = await queryOne<{ id: string }>("SELECT id FROM profiles WHERE id = $id", {
      id: userId,
    });
    if (!existing) {
      await execute(
        `INSERT INTO profiles (id, full_name, language)
         VALUES ($id, $full_name, $language)`,
        { id: userId, full_name: "", language: data.language ?? "en" },
      );
    }

    const sets: string[] = ["updated_at = current_timestamp"];
    const params: Record<string, string | number | null> = { id: userId };
    if (data.full_name !== undefined) {
      sets.push("full_name = $full_name");
      params.full_name = data.full_name;
    }
    if (data.language !== undefined) {
      sets.push("language = $language");
      params.language = data.language;
    }
    if (data.region_id !== undefined) {
      sets.push("region_id = $region_id");
      params.region_id = data.region_id;
    }
    if (data.sex !== undefined) {
      sets.push("sex = $sex");
      params.sex = data.sex;
    }
    if (data.salary_importance !== undefined) {
      sets.push("salary_importance = $salary_importance");
      params.salary_importance = data.salary_importance;
    }
    if (data.age !== undefined) {
      sets.push("age = $age");
      params.age = data.age;
    }

    if (sets.length > 1) {
      await execute(`UPDATE profiles SET ${sets.join(", ")} WHERE id = $id`, params);
    }

    const row = await queryOne<ProfileRow>(
      `SELECT id, full_name, language, region_id, sex, salary_importance, age
       FROM profiles WHERE id = $id`,
      { id: userId },
    );
    if (!row) throw new Error("Failed to load profile after update");
    return row;
  });

export const getProfileRegion = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      sex: string | null;
      region: { name: string | null; country_code: string | null } | null;
    }> => {
      const { userId } = context;
      const row = await queryOne<{
        sex: string | null;
        region_name: string | null;
        country_code: string | null;
      }>(
        `SELECT p.sex, r.name AS region_name, r.country_code
       FROM profiles p LEFT JOIN regions r ON r.id = p.region_id
       WHERE p.id = $id`,
        { id: userId },
      );
      if (!row) return { sex: null, region: null };
      return {
        sex: row.sex,
        region: row.region_name ? { name: row.region_name, country_code: row.country_code } : null,
      };
    },
  );
