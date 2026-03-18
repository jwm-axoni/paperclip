import { api } from "./client";

export type Signal = {
  id: string;
  companyId: string;
  source: string;
  signalType: string;
  title: string;
  content: string | null;
  url: string | null;
  vertical: string | null;
  geography: string | null;
  severity: string;
  metadata: Record<string, unknown>;
  processed: boolean;
  createdAt: string;
};

export type SignalStats = {
  total: number;
  today: number;
  unprocessed: number;
  bySeverity: Record<string, number>;
  bySource: Record<string, number>;
};

export type Opportunity = {
  id: string;
  companyId: string;
  signalId: string | null;
  clientName: string | null;
  opportunityType: string;
  urgency: string;
  brief: string;
  suggestedActions: unknown[];
  status: string;
  approvedBy: string | null;
  assignedAgentId: string | null;
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OpportunityStats = {
  total: number;
  pending: number;
  approved: number;
  executed: number;
  byType: Record<string, number>;
  byClient: Record<string, number>;
};

export const signalsApi = {
  list: (companyId: string, params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<Signal[]>(`/companies/${companyId}/signals${qs}`);
  },
  stats: (companyId: string) =>
    api.get<SignalStats>(`/companies/${companyId}/signals/stats`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Signal>(`/companies/${companyId}/signals`, data),
  markProcessed: (companyId: string, ids: string[]) =>
    api.post<{ processed: number }>(`/companies/${companyId}/signals/mark-processed`, { ids }),
};

export const opportunitiesApi = {
  list: (companyId: string, params?: Record<string, string>) => {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return api.get<Opportunity[]>(`/companies/${companyId}/opportunities${qs}`);
  },
  stats: (companyId: string) =>
    api.get<OpportunityStats>(`/companies/${companyId}/opportunities/stats`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Opportunity>(`/companies/${companyId}/opportunities`, data),
  updateStatus: (companyId: string, opportunityId: string, status: string, approvedBy?: string) =>
    api.patch<Opportunity>(`/companies/${companyId}/opportunities/${opportunityId}/status`, {
      status,
      approvedBy,
    }),
};
