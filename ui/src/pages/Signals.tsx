import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Radio,
  Newspaper,
  MessageSquare,
  Car,
  Building2,
  CloudLightning,
  MapPin,
  ExternalLink,
  Zap,
  Eye,
  EyeOff,
  Target,
  ArrowRight,
} from "lucide-react";
import { signalsApi, opportunitiesApi } from "../api/signals";
import type { Signal, Opportunity } from "../api/signals";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SOURCE_CONFIG: Record<string, { label: string; icon: typeof Radio }> = {
  weather_gov: { label: "Weather.gov", icon: CloudLightning },
  google_news_rss: { label: "Google News", icon: Newspaper },
  reddit: { label: "Reddit", icon: MessageSquare },
  nhtsa: { label: "NHTSA", icon: Car },
  fda: { label: "FDA", icon: Building2 },
  local_news: { label: "Local News", icon: MapPin },
  fierce_healthcare: { label: "Fierce HC", icon: Building2 },
  aba_journal: { label: "ABA Journal", icon: Building2 },
  roofing_contractor: { label: "Roofing Mag", icon: Building2 },
  digital_dealer: { label: "Digital Dealer", icon: Car },
  orlando_biz_journal: { label: "Orlando BJ", icon: MapPin },
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-destructive text-white",
  high: "bg-orange-500/15 text-orange-500 border-orange-500/20",
  normal: "bg-secondary text-secondary-foreground",
  low: "bg-muted text-muted-foreground",
};

const VERTICAL_LABELS: Record<string, string> = {
  home_services: "Home Services",
  healthcare: "Healthcare",
  legal: "Legal",
  automotive: "Automotive",
};

const URGENCY_STYLES: Record<string, string> = {
  immediate: "bg-destructive text-white",
  this_week: "bg-orange-500/15 text-orange-500 border-orange-500/20",
  this_month: "bg-secondary text-secondary-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  content_idea: "Content Idea",
  outreach_trigger: "Outreach Trigger",
  retention_alert: "Retention Alert",
  competitive_intel: "Competitive Intel",
  urgent_response: "Urgent Response",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-600 border-yellow-500/20",
  approved: "bg-green-500/15 text-green-600 border-green-500/20",
  rejected: "bg-destructive/15 text-destructive border-destructive/20",
  in_progress: "bg-blue-500/15 text-blue-600 border-blue-500/20",
  executed: "bg-secondary text-secondary-foreground",
};

export function Signals() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [showProcessed, setShowProcessed] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Signals" }]);
  }, [setBreadcrumbs]);

  const { data: signalsList, isLoading: signalsLoading } = useQuery({
    queryKey: [...queryKeys.signals.list(selectedCompanyId!), verticalFilter, showProcessed],
    queryFn: () => {
      const params: Record<string, string> = { limit: "100" };
      if (verticalFilter !== "all") params.vertical = verticalFilter;
      if (!showProcessed) params.processed = "false";
      return signalsApi.list(selectedCompanyId!, params);
    },
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.signals.stats(selectedCompanyId!),
    queryFn: () => signalsApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: oppList } = useQuery({
    queryKey: queryKeys.opportunities.list(selectedCompanyId!),
    queryFn: () => opportunitiesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const { data: oppStats } = useQuery({
    queryKey: queryKeys.opportunities.stats(selectedCompanyId!),
    queryFn: () => opportunitiesApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const verticals = useMemo(() => {
    if (!stats?.bySource) return [];
    const vSet = new Set<string>();
    for (const s of signalsList ?? []) {
      if (s.vertical) vSet.add(s.vertical);
    }
    return Array.from(vSet).sort();
  }, [signalsList, stats]);

  if (signalsLoading && statsLoading) return <PageSkeleton variant="dashboard" />;

  return (
    <div className="space-y-6">
      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border">
          <MetricCard icon={Radio} value={stats?.total ?? 0} label="Total Signals" />
        </div>
        <div className="rounded-lg border border-border">
          <MetricCard icon={Zap} value={stats?.today ?? 0} label="Today" />
        </div>
        <div className="rounded-lg border border-border">
          <MetricCard icon={Eye} value={stats?.unprocessed ?? 0} label="Unprocessed" />
        </div>
        <div className="rounded-lg border border-border">
          <MetricCard icon={Target} value={oppStats?.pending ?? 0} label="Pending Opportunities" />
        </div>
      </div>

      {/* Source breakdown */}
      {stats && Object.keys(stats.bySource).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(stats.bySource)
            .sort(([, a], [, b]) => b - a)
            .map(([source, count]) => {
              const cfg = SOURCE_CONFIG[source];
              const Icon = cfg?.icon ?? Radio;
              return (
                <Badge key={source} variant="outline" className="gap-1 py-1">
                  <Icon className="h-3 w-3" />
                  {cfg?.label ?? source}: {count}
                </Badge>
              );
            })}
        </div>
      )}

      <Tabs defaultValue="signals">
        <TabsList>
          <TabsTrigger value="signals">Signals ({signalsList?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities ({oppList?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={verticalFilter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setVerticalFilter("all")}
            >
              All
            </Button>
            {verticals.map((v) => (
              <Button
                key={v}
                variant={verticalFilter === v ? "default" : "outline"}
                size="sm"
                onClick={() => setVerticalFilter(v)}
              >
                {VERTICAL_LABELS[v] ?? v}
              </Button>
            ))}
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowProcessed(!showProcessed)}
                className="gap-1 text-xs"
              >
                {showProcessed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showProcessed ? "Hide processed" : "Show processed"}
              </Button>
            </div>
          </div>

          {/* Signal feed */}
          {(!signalsList || signalsList.length === 0) ? (
            <EmptyState
              icon={Radio}
              message="No signals yet. Signals are collected from free APIs: weather alerts, industry news, recalls, and trending topics."
            />
          ) : (
            <div className="space-y-1">
              {signalsList.map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="opportunities" className="space-y-4 mt-4">
          {/* Opp stats */}
          {oppStats && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(oppStats.byType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <Badge key={type} variant="outline" className="gap-1 py-1">
                    {TYPE_LABELS[type] ?? type}: {count}
                  </Badge>
                ))}
            </div>
          )}

          {(!oppList || oppList.length === 0) ? (
            <EmptyState
              icon={Target}
              message="No opportunities yet. Opportunities are created when signals are matched to clients. Run the signal-matcher to generate them."
            />
          ) : (
            <div className="space-y-2">
              {oppList.map((opp) => (
                <OpportunityRow key={opp.id} opportunity={opp} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  const cfg = SOURCE_CONFIG[signal.source];
  const Icon = cfg?.icon ?? Radio;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-3 py-2.5 rounded-md border border-border transition-colors hover:bg-accent/30",
        signal.severity === "critical" && "border-destructive/30 bg-destructive/5",
        signal.severity === "high" && "border-orange-500/20 bg-orange-500/5",
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug">{signal.title}</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={cn("text-[10px]", SEVERITY_STYLES[signal.severity])}>
              {signal.severity}
            </Badge>
            {signal.vertical && (
              <Badge variant="outline" className="text-[10px]">
                {VERTICAL_LABELS[signal.vertical] ?? signal.vertical}
              </Badge>
            )}
            {signal.processed && (
              <Badge variant="secondary" className="text-[10px]">processed</Badge>
            )}
          </div>
        </div>
        {signal.content && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{signal.content}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[10px] font-mono text-muted-foreground">
            {cfg?.label ?? signal.source}
          </span>
          {signal.geography && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <MapPin className="h-2.5 w-2.5" /> {signal.geography}
            </span>
          )}
          <span className="text-[10px] font-mono text-muted-foreground">
            {timeAgo(signal.createdAt)}
          </span>
          {signal.url && !signal.url.startsWith("nws-") && !signal.url.startsWith("nhtsa-") && !signal.url.startsWith("fda-") && (
            <a
              href={signal.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
            >
              Source <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function OpportunityRow({ opportunity }: { opportunity: Opportunity }) {
  return (
    <div className="px-4 py-3 rounded-md border border-border hover:bg-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {opportunity.clientName && (
              <span className="text-xs font-semibold text-primary">{opportunity.clientName}</span>
            )}
            <Badge variant="outline" className={cn("text-[10px]", URGENCY_STYLES[opportunity.urgency])}>
              {opportunity.urgency.replace("_", " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {TYPE_LABELS[opportunity.opportunityType] ?? opportunity.opportunityType}
            </Badge>
          </div>
          <p className="text-sm">{opportunity.brief}</p>
          {Array.isArray(opportunity.suggestedActions) && opportunity.suggestedActions.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {(opportunity.suggestedActions as string[]).map((action, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ArrowRight className="h-3 w-3 shrink-0" />
                  {action}
                </div>
              ))}
            </div>
          )}
        </div>
        <Badge variant="outline" className={cn("text-[10px] shrink-0", STATUS_STYLES[opportunity.status])}>
          {opportunity.status}
        </Badge>
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-[10px] font-mono text-muted-foreground">{timeAgo(opportunity.createdAt)}</span>
        {opportunity.approvedBy && (
          <span className="text-[10px] text-muted-foreground">
            Approved by {opportunity.approvedBy}
          </span>
        )}
      </div>
    </div>
  );
}
