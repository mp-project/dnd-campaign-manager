import type {
  AdvanceCampaignTimeInput,
  Campaign,
  CampaignTimeEntry,
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

type HistoryFieldChange = {
  seq: number;
  eventId: string;
  action: string;
  value: number;
  delta: number | null;
  isBaseline: boolean;
  reason: string | null;
  createdAt: string;
};

async function listCounterChanges(
  campaignId: string,
  field: "currentGameDay" | "longRestCount",
  limit: number,
): Promise<HistoryFieldChange[]> {
  const response = await request<{ data: HistoryFieldChange[] }>(
    `/history/campaign/${campaignId}?field=${field}&limit=${limit}`,
    {
      method: "GET",
    },
  );

  return response.data.filter((change) => !change.isBaseline && change.delta !== null);
}

function toCounterChange(change: HistoryFieldChange | undefined) {
  return change
    ? { previous: change.value - (change.delta ?? 0), next: change.value }
    : null;
}

export async function getCampaignTimeHistory(
  campaignId: string,
  limit = 50,
): Promise<CampaignTimeEntry[]> {
  const [gameDays, longRests] = await Promise.all([
    listCounterChanges(campaignId, "currentGameDay", limit),
    listCounterChanges(campaignId, "longRestCount", limit),
  ]);
  const events = new Map([...gameDays, ...longRests].map((change) => [change.eventId, change]));

  return [...events.values()]
    .sort((left, right) => right.seq - left.seq)
    .slice(0, limit)
    .map((event) => ({
      id: event.eventId,
      action: event.action,
      gameDay: toCounterChange(gameDays.find((change) => change.eventId === event.eventId)),
      longRests: toCounterChange(longRests.find((change) => change.eventId === event.eventId)),
      reason: event.reason,
      createdAt: event.createdAt,
    }));
}
