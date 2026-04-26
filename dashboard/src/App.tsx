import { FormEvent, useEffect, useState } from "react";
import {
  getCustomerSummary,
  getCurrentAdmin,
  getPolicyDashboardData,
  signInAdmin,
  signOutAdmin,
  signUpAdmin,
} from "./lib/policyClient";
import type { AdminProfile, CustomerSummaryPayload, PolicyPayload } from "./types";

function formatNumber(value: number | null, digits = 0): string {
  if (value === null) return "n/a";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("dashboard_admin_token"));
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [policyData, setPolicyData] = useState<PolicyPayload | null>(null);
  const [customerData, setCustomerData] = useState<CustomerSummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [sexFilter, setSexFilter] = useState("total");
  const [referenceYear, setReferenceYear] = useState("");
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const me = await getCurrentAdmin(token);
        setAdmin(me);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authentication failed.");
        setToken(null);
        setAdmin(null);
        setPolicyData(null);
        setCustomerData(null);
        localStorage.removeItem("dashboard_admin_token");
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token || !admin) return;
    void (async () => {
      try {
        const policyPayload = await getPolicyDashboardData({
          token,
          country: admin.country_code,
          sex: sexFilter,
          reference_year: referenceYear ? Number(referenceYear) : undefined,
          start_year: startYear ? Number(startYear) : undefined,
          end_year: endYear ? Number(endYear) : undefined,
        });
        setPolicyData(policyPayload);

        const customerPayload = await getCustomerSummary({
          token,
          country: admin.country_code,
          region: admin.region,
        });
        setCustomerData(customerPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Dashboard data loading failed.");
      }
    })();
  }, [token, admin, sexFilter, referenceYear, startYear, endYear]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();
    const country_code = String(formData.get("country_code") ?? "").trim().toUpperCase();
    const region = String(formData.get("region") ?? "").trim();
    setError(null);

    try {
      const result =
        authMode === "signup"
          ? await signUpAdmin({ email, password, country_code, region })
          : await signInAdmin({ email, password });
      localStorage.setItem("dashboard_admin_token", result.token);
      setToken(result.token);
      setAdmin(result.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    }
  }

  async function handleSignOut() {
    if (token) {
      try {
        await signOutAdmin(token);
      } catch {
        // Ignore signout API errors in local demo mode.
      }
    }
    localStorage.removeItem("dashboard_admin_token");
    setToken(null);
    setAdmin(null);
    setPolicyData(null);
    setCustomerData(null);
  }

  if (!token || !admin) {
    return (
      <div className="page auth-page">
        <div className="aurora" />
        <section className="card auth-card">
          <p className="eyebrow">Admin Access</p>
          <h2>{authMode === "signin" ? "Sign in to dashboard" : "Create policymaker account"}</h2>
          <p className="muted">Use email/password with country and region profile for local signals.</p>
          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Password
              <input name="password" type="password" minLength={6} required />
            </label>
            {authMode === "signup" && (
              <>
                <label>
                  Country code (ISO-3)
                  <input name="country_code" type="text" maxLength={3} required />
                </label>
                <label>
                  Region
                  <input name="region" type="text" required />
                </label>
              </>
            )}
            {error && <p className="auth-error">{error}</p>}
            <button type="submit">{authMode === "signin" ? "Sign in" : "Create account"}</button>
          </form>
          <p className="muted auth-switch">
            {authMode === "signin" ? "No account yet?" : "Already registered?"}{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
            >
              {authMode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </section>
      </div>
    );
  }

  if (!policyData || !customerData) {
    return (
      <div className="page">
        <div className="content">
          <section className="card hero">
            <h2>Loading dashboard data...</h2>
          </section>
        </div>
      </div>
    );
  }

  const topSector = policyData.sector_growth[0];
  const topSkill = customerData.skill_distribution[0];
  const laborPressureIndex =
    topSector?.growth_pct && policyData.kpis.minimum_wage_monthly_local
      ? topSector.growth_pct / policyData.kpis.minimum_wage_monthly_local
      : null;

  return (
    <div className="page">
      <div className="aurora" />
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <div>
            <p className="brand-eyebrow">UNMAPPED</p>
            <h1>Policy Dashboard</h1>
          </div>
        </div>
        <p className="topbar-context">
          {policyData.context.country} · {policyData.context.reference_year ?? "latest"} ·{" "}
          {policyData.context.sex} · {admin.email}
        </p>
        <button className="link-button" onClick={() => void handleSignOut()}>
          Sign out
        </button>
      </header>

      <main className="content">
        <section className="card filters">
          <div className="filters-header">
            <p className="eyebrow">Context</p>
            <p className="muted">Filters refresh both econometric and customer signals.</p>
          </div>
          <div className="filters-grid">
            <label>
              Sex
              <select value={sexFilter} onChange={(e) => setSexFilter(e.target.value)}>
                <option value="total">Total</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </label>
            <label>
              Reference year
              <input
                type="number"
                placeholder="latest"
                value={referenceYear}
                onChange={(e) => setReferenceYear(e.target.value)}
              />
            </label>
            <label>
              Start year
              <input
                type="number"
                placeholder="auto"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
              />
            </label>
            <label>
              End year
              <input
                type="number"
                placeholder="auto"
                value={endYear}
                onChange={(e) => setEndYear(e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="hero card">
          <div>
            <p className="eyebrow">Real labor market signals</p>
            <h2>Grounded opportunity insights for policymakers</h2>
            <p className="muted">
              View minimum wage, sector growth, and education returns alongside user-skill
              distribution in one local demo interface.
            </p>
          </div>
          <div className="hero-stats">
            <div className="metric">
              <span>Users in country</span>
              <strong>{customerData.totals.users_total_country}</strong>
            </div>
            <div className="metric">
              <span>Users in {admin.region}</span>
              <strong>{customerData.totals.users_in_region}</strong>
            </div>
            <div className="metric">
              <span>Avg skills / user</span>
              <strong>{formatNumber(customerData.totals.avg_skills_per_user_region, 1)}</strong>
            </div>
          </div>
        </section>

        <section className="card section-title">
          <p className="eyebrow">Econometric Signals</p>
          <p className="muted">Labor market and wage context from ILOSTAT datasets.</p>
        </section>

        <section className="grid kpis">
          <KpiCard
            title="Minimum wage (monthly)"
            value={formatNumber(policyData.kpis.minimum_wage_monthly_local)}
            sub={`Year: ${policyData.kpis.minimum_wage_year_used ?? "n/a"}`}
          />
          <KpiCard
            title="Avg monthly earnings (education aggregate)"
            value={formatNumber(policyData.kpis.avg_monthly_earnings_by_education_overall)}
            sub={`Year: ${policyData.kpis.education_earnings_year_used ?? "n/a"}`}
          />
          <KpiCard
            title="Top sector growth"
            value={`${formatNumber(policyData.sector_growth[0]?.growth_pct ?? null, 1)}%`}
            sub={policyData.sector_growth[0]?.economic_activity ?? "n/a"}
          />
        </section>

        <section className="grid panels">
          <div className="card table-card">
            <h3>Sector employment growth</h3>
            <PolicyTable
              headers={["Economic activity", "Start", "End", "Growth %"]}
              rows={policyData.sector_growth.slice(0, 8).map((item) => [
                item.economic_activity,
                formatNumber(item.employment_start),
                formatNumber(item.employment_end),
                `${formatNumber(item.growth_pct, 1)}%`,
              ])}
            />
          </div>

          <div className="card table-card">
            <h3>Returns to education</h3>
            <PolicyTable
              headers={["Education level", "Avg earnings", "Premium vs lowest"]}
              rows={policyData.education_returns.map((item) => [
                item.education_level,
                formatNumber(item.avg_monthly_earnings_local),
                `${formatNumber(item.premium_vs_lowest_level_pct, 1)}%`,
              ])}
            />
          </div>
        </section>

        <section className="card section-title">
          <p className="eyebrow">Customer Signals</p>
          <p className="muted">Regional user profile distribution and opportunity concentration.</p>
        </section>

        <section className="grid kpis">
          <KpiCard
            title="Top regional skill"
            value={topSkill?.skill ?? "n/a"}
            sub={`Mentions: ${topSkill?.count ?? 0}`}
          />
          <KpiCard
            title="Top opportunity (regional)"
            value={customerData.opportunity_summary[0]?.occupation ?? "n/a"}
            sub={`Profiles: ${customerData.opportunity_summary[0]?.count ?? 0}`}
          />
          <KpiCard
            title="Labor pressure index"
            value={formatNumber(laborPressureIndex, 3)}
            sub="Top growth % / minimum wage"
          />
        </section>

        <section className="grid panels">
          <div className="card table-card">
            <h3>Top skills in region</h3>
            <PolicyTable
              headers={["Skill", "Count"]}
              rows={customerData.skill_distribution.map((item) => [
                item.skill,
                formatNumber(item.count),
              ])}
            />
          </div>
          <div className="card table-card">
            <h3>Top opportunity suggestions</h3>
            <PolicyTable
              headers={["Occupation", "Profiles"]}
              rows={customerData.opportunity_summary.map((item) => [
                item.occupation,
                formatNumber(item.count),
              ])}
            />
          </div>
        </section>

        <section className="card users">
          <h3>Customer drilldown ({admin.region})</h3>
          <div className="user-list">
            {customerData.customers.map((profile) => (
              <article key={profile.id} className="user-item">
                <div>
                  <p className="user-name">{profile.name}</p>
                  <p className="muted">
                    {profile.region}, {profile.country}
                  </p>
                </div>
                <p className="suggestion">{profile.top_occupation_suggestion}</p>
                <div className="chips">
                  {profile.skills.map((skill) => (
                    <span className="chip" key={skill}>
                      {skill}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        {policyData.warnings.length > 0 && (
          <section className="card warning">
            <h3>Data warnings</h3>
            <ul>
              {policyData.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function KpiCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <article className="card kpi-card">
      <p className="eyebrow">{title}</p>
      <strong>{value}</strong>
      <p className="muted">{sub}</p>
    </article>
  );
}

function PolicyTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${idx}-${row[0]}`}>
              {row.map((col, colIdx) => (
                <td key={`${idx}-${colIdx}`}>{col}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

