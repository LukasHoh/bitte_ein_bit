import type { AdminProfile, CustomerSummaryPayload, PolicyPayload } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function signUpAdmin(payload: {
  email: string;
  password: string;
  country_code: string;
  region: string;
}): Promise<{ token: string; admin: AdminProfile }> {
  return request("/api/v1/admin/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function signInAdmin(payload: {
  email: string;
  password: string;
}): Promise<{ token: string; admin: AdminProfile }> {
  return request("/api/v1/admin/signin", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCurrentAdmin(token: string): Promise<AdminProfile> {
  const response = await request<{ admin: AdminProfile }>("/api/v1/admin/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.admin;
}

export async function signOutAdmin(token: string): Promise<void> {
  await request<{ ok: boolean }>("/api/v1/admin/signout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getPolicyDashboardData(input: {
  token: string;
  country: string;
  sex?: string;
  reference_year?: number;
  start_year?: number;
  end_year?: number;
}): Promise<PolicyPayload> {
  const params = new URLSearchParams({ country: input.country });
  if (input.sex) params.set("sex", input.sex);
  if (input.reference_year) params.set("reference_year", String(input.reference_year));
  if (input.start_year) params.set("start_year", String(input.start_year));
  if (input.end_year) params.set("end_year", String(input.end_year));

  return request(`/api/v1/policy/dashboard?${params.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.token}` },
  });
}

export async function getCustomerSummary(input: {
  token: string;
  country: string;
  region?: string;
}): Promise<CustomerSummaryPayload> {
  const params = new URLSearchParams({ country: input.country });
  if (input.region) params.set("region", input.region);
  return request(`/api/v1/policy/customer-summary?${params.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${input.token}` },
  });
}

