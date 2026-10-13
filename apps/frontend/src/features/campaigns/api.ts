import type {
  AdvanceCampaignTimeInput,
  Campaign,
  CampaignTimeEvent,
  CorrectCampaignTimeInput,
  CreateCampaignInput,
  ListResponse,
  UpdateCampaignInput,
} from "@/features/campaigns/types";

type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ApiError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const payload = (await response.json()) as ErrorPayload;
      message = payload.error?.message ?? message;
    } catch {
      // Keep default message when body is not JSON.
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function fetchGlobalPermissions(): Promise<string[]> {
  const response = await request<{ effectiveGlobalPermissions: string[] }>("/me", {
    method: "GET",
  });

  return response.effectiveGlobalPermissions;
}

export async function listCampaigns(params: {
  includeArchived?: boolean;
  limit?: number;
} = {}): Promise<ListResponse<Campaign>> {
  const query = new URLSearchParams();
  query.set("limit", String(params.limit ?? 50));

  if (params.includeArchived) {
    query.set("includeArchived", "true");
  }

  const queryString = query.toString();

  return request<ListResponse<Campaign>>(`/campaigns${queryString ? `?${queryString}` : ""}`, {
    method: "GET",
  });
}

export async function getCampaign(campaignId: string): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${campaignId}`, {
    method: "GET",
  });
}

export async function createCampaign(input: CreateCampaignInput): Promise<Campaign> {
  return request<Campaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCampaign(
  campaignId: string,
  input: UpdateCampaignInput,
): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${campaignId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveCampaign(campaignId: string): Promise<void> {
  await request<void>(`/campaigns/${campaignId}`, {
    method: "DELETE",
  });
}

export async function advanceCampaignTime(
  campaignId: string,
  input: AdvanceCampaignTimeInput,
): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${campaignId}/time/advance`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function correctCampaignTime(
  campaignId: string,
  input: CorrectCampaignTimeInput,
): Promise<Campaign> {
  return request<Campaign>(`/campaigns/${campaignId}/time/correct`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getCampaignTimeHistory(
  campaignId: string,
  limit = 50,
): Promise<ListResponse<CampaignTimeEvent>> {
  return request<ListResponse<CampaignTimeEvent>>(
    `/campaigns/${campaignId}/time/history?limit=${limit}`,
    {
      method: "GET",
    },
  );
}
