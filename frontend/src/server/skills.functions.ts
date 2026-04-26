/**
 * Server functions for the skills + user_skills tables.
 *
 * Replaces direct Supabase calls inside `SkillsWorkspace`, the dashboard, and
 * the matching page. All mutations enforce session ownership through the
 * `requireAuth` middleware.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { execute, query, queryOne } from "@/integrations/db/client.server";
import { requireAuth } from "@/integrations/db/session.server";

export type UserSkillRow = {
  id: string;
  proficiency: string | null;
  llm_level: string | null;
  user_quote: string | null;
  name: string;
};

const ProficiencyEnum = z.enum(["beginner", "intermediate", "advanced", "expert"]);
const SourceEnum = z.enum(["chat", "manual", "imported"]);

const PersistInput = z.object({
  name: z.string().trim().min(1).max(200),
  proficiency: ProficiencyEnum,
  llm_level: z.string().trim().max(50).nullable().optional(),
  user_quote: z.string().trim().max(2000).nullable().optional(),
  source: SourceEnum,
});

const UpdateLevelInput = z.object({
  user_skill_id: z.string().uuid(),
  proficiency: ProficiencyEnum,
  llm_level: z.string().trim().max(50).nullable().optional(),
});

const DeleteInput = z.object({
  user_skill_id: z.string().uuid(),
});

export const listUserSkills = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<UserSkillRow[]> => {
    const { userId } = context;
    return query<UserSkillRow>(
      `SELECT us.id, us.proficiency, us.llm_level, us.user_quote, s.name
       FROM user_skills us JOIN skills s ON s.id = us.skill_id
       WHERE us.user_id = $user_id
       ORDER BY us.created_at DESC`,
      { user_id: userId },
    );
  });

export const countUserSkills = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<number> => {
    const { userId } = context;
    const row = await queryOne<{ n: number | bigint }>(
      "SELECT COUNT(*) AS n FROM user_skills WHERE user_id = $user_id",
      { user_id: userId },
    );
    return Number(row?.n ?? 0);
  });

/**
 * Looks up the skill by name (case-insensitive); creates one when missing.
 * Then upserts the user_skills link with the requested level.
 *
 * Returns `{ created: true }` for a brand-new user_skills row,
 * `{ created: false }` when an existing link was updated.
 */
export const persistUserSkill = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => PersistInput.parse(input))
  .handler(async ({ data, context }): Promise<{ created: boolean; user_skill_id: string }> => {
    const { userId } = context;
    const normalizedName = data.name.trim();
    if (!normalizedName) throw new Error("Missing skill name.");

    const existingSkill = await queryOne<{ id: string }>(
      "SELECT id FROM skills WHERE LOWER(name) = LOWER($name) LIMIT 1",
      { name: normalizedName },
    );
    let skillId = existingSkill?.id ?? null;
    if (!skillId) {
      skillId = crypto.randomUUID();
      await execute("INSERT INTO skills (id, name, category) VALUES ($id, $name, $category)", {
        id: skillId,
        name: normalizedName,
        category: "chat",
      });
    }

    const existingLink = await queryOne<{ id: string }>(
      `SELECT id FROM user_skills
       WHERE user_id = $user_id AND skill_id = $skill_id LIMIT 1`,
      { user_id: userId, skill_id: skillId },
    );

    if (existingLink) {
      await execute(
        `UPDATE user_skills
         SET proficiency = $proficiency, llm_level = $llm_level
         WHERE id = $id`,
        {
          id: existingLink.id,
          proficiency: data.proficiency,
          llm_level: data.llm_level ?? null,
        },
      );
      return { created: false, user_skill_id: existingLink.id };
    }

    const newId = crypto.randomUUID();
    await execute(
      `INSERT INTO user_skills (id, user_id, skill_id, proficiency, source, llm_level, user_quote)
       VALUES ($id, $user_id, $skill_id, $proficiency, $source, $llm_level, $user_quote)`,
      {
        id: newId,
        user_id: userId,
        skill_id: skillId,
        proficiency: data.proficiency,
        source: data.source,
        llm_level: data.llm_level ?? null,
        user_quote: data.user_quote ?? null,
      },
    );
    return { created: true, user_skill_id: newId };
  });

export const updateUserSkillLevel = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => UpdateLevelInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { userId } = context;
    await execute(
      `UPDATE user_skills
       SET proficiency = $proficiency, llm_level = $llm_level
       WHERE id = $id AND user_id = $user_id`,
      {
        id: data.user_skill_id,
        user_id: userId,
        proficiency: data.proficiency,
        llm_level: data.llm_level ?? null,
      },
    );
    return { ok: true };
  });

export const deleteUserSkill = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => DeleteInput.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { userId } = context;
    await execute("DELETE FROM user_skills WHERE id = $id AND user_id = $user_id", {
      id: data.user_skill_id,
      user_id: userId,
    });
    return { ok: true };
  });
