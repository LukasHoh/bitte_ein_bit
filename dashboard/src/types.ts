export type PolicyKpis = {
  minimum_wage_monthly_local: number | null;
  minimum_wage_year_used: number | null;
  avg_monthly_earnings_by_education_overall: number | null;
  education_earnings_year_used: number | null;
};

export type SectorGrowthItem = {
  economic_activity: string;
  start_year: number;
  end_year: number;
  employment_start: number;
  employment_end: number;
  growth_abs: number;
  growth_pct: number | null;
};

export type EducationReturnItem = {
  education_level: string;
  avg_monthly_earnings_local: number;
  premium_vs_lowest_level_pct: number | null;
};

export type PolicyPayload = {
  context: {
    country: string;
    sex: string;
    reference_year: number | null;
    start_year: number | null;
    end_year: number | null;
  };
  kpis: PolicyKpis;
  sector_growth: SectorGrowthItem[];
  education_returns: EducationReturnItem[];
  warnings: string[];
};

export type CustomerSkillProfile = {
  id: string;
  name: string;
  region: string;
  country: string;
  skills: string[];
  top_occupation_suggestion: string;
};

export type AdminProfile = {
  admin_id?: string;
  email: string;
  country_code: string;
  region: string;
};

export type CustomerSummaryPayload = {
  context: {
    country: string;
    region: string | null;
  };
  totals: {
    users_total_country: number;
    users_in_region: number;
    avg_skills_per_user_region: number;
  };
  skill_distribution: Array<{
    skill: string;
    count: number;
  }>;
  opportunity_summary: Array<{
    occupation: string;
    count: number;
  }>;
  customers: CustomerSkillProfile[];
};

