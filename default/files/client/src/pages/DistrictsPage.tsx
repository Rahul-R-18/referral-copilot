import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';

interface HealthIndicator {
  district_name: string;
  state_ut: string;
  institutional_birth_5y_pct: number | null;
  births_attended_by_skilled_hp_5y_10_pct: number | null;
  hh_member_covered_health_insurance_pct: number | null;
  hh_improved_water_pct: number | null;
  hh_use_improved_sanitation_pct: number | null;
  households_using_clean_fuel_for_cooking_pct: number | null;
  women_age_15_49_who_are_literate_pct: number | null;
  fp_cm_w15_49_modern_method_pct: number | null;
  households_surveyed: number | null;
}

function pct(v: number | null | undefined) {
  if (v == null || isNaN(Number(v))) return '—';
  return `${Number(v).toFixed(1)}%`;
}

function IndicatorBar({ value, max = 100 }: { value: number | null | undefined; max?: number }) {
  if (value == null || isNaN(Number(value))) {
    return <div className="h-1.5 bg-muted rounded-full w-full" />;
  }
  const pctWidth = Math.min(100, (Number(value) / max) * 100);
  const color =
    pctWidth >= 70 ? '#22c55e' : pctWidth >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="h-1.5 bg-muted rounded-full w-full">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pctWidth}%`, backgroundColor: color }} />
    </div>
  );
}

function IndicatorCard({
  title,
  value,
}: {
  title: string;
  value: number | null | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground leading-tight">{title}</p>
        <p className="text-sm font-semibold text-foreground tabular-nums">{pct(value)}</p>
      </div>
      <IndicatorBar value={value} />
    </div>
  );
}

export function DistrictsPage() {
  const [states, setStates] = useState<string[]>([]);
  const [selectedState, setSelectedState] = useState('');
  const [indicators, setIndicators] = useState<HealthIndicator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health-indicators/states/list')
      .then((r) => r.json() as Promise<string[]>)
      .then(setStates)
      .catch(() => setStates([]));
  }, []);

  useEffect(() => {
    if (!selectedState) {
      setIndicators([]);
      return;
    }
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ state: selectedState });
    fetch(`/api/health-indicators?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json() as Promise<HealthIndicator[]>;
      })
      .then(setIndicators)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [selectedState]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">District Health Indicators</h2>
        <p className="text-muted-foreground mt-1">
          NFHS-5 public health metrics by district — context for smarter referral decisions
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <Select
            value={selectedState}
            onValueChange={(v) => setSelectedState(v === '_none' ? '' : v)}
          >
            <SelectTrigger className="w-full sm:w-72">
              <SelectValue placeholder="Select a state or UT…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">Select a state or UT…</SelectItem>
              {states.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && (
        <div className="text-destructive bg-destructive/10 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {!selectedState && !loading && (
        <div className="rounded-xl border bg-[#F9F7F4] py-16 text-center">
          <p className="text-muted-foreground text-sm">Select a state to view district health indicators</p>
        </div>
      )}

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
        </div>
      )}

      {!loading && indicators.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {indicators.map((ind) => (
            <Card key={`${ind.state_ut}-${ind.district_name}`} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{ind.district_name}</CardTitle>
                <p className="text-xs text-muted-foreground">{ind.state_ut}</p>
                {ind.households_surveyed && (
                  <p className="text-xs text-muted-foreground">
                    {Number(ind.households_surveyed).toLocaleString()} households surveyed
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <IndicatorCard
                  title="Institutional births"
                  value={ind.institutional_birth_5y_pct}
                />
                <IndicatorCard
                  title="Skilled birth attendance"
                  value={ind.births_attended_by_skilled_hp_5y_10_pct}
                />
                <IndicatorCard
                  title="Health insurance coverage"
                  value={ind.hh_member_covered_health_insurance_pct}
                />
                <IndicatorCard
                  title="Improved water source"
                  value={ind.hh_improved_water_pct}
                />
                <IndicatorCard
                  title="Improved sanitation"
                  value={ind.hh_use_improved_sanitation_pct}
                />
                <IndicatorCard
                  title="Clean cooking fuel"
                  value={ind.households_using_clean_fuel_for_cooking_pct}
                />
                <IndicatorCard
                  title="Women's literacy (15–49)"
                  value={ind.women_age_15_49_who_are_literate_pct}
                />
                <IndicatorCard
                  title="Modern contraceptive use"
                  value={ind.fp_cm_w15_49_modern_method_pct}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
