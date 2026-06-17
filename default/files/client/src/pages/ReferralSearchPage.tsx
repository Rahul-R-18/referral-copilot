import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardTitle,
  Button,
  Input,
  Badge,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { Search, MapPin, Phone, Bookmark, BookmarkCheck, AlertTriangle, ChevronDown, ChevronUp, X, Trash2 } from 'lucide-react';

interface SearchResult {
  unique_id: string;
  name: string;
  address_city: string | null;
  address_stateOrRegion: string | null;
  officialPhone: string | null;
  specialties: string | null;
  numberDoctors: string | null;
  capacity: string | null;
  distance_km: number;
  match_score: number;
  evidence: string[];
  missing_fields: string[];
}

interface SearchResponse {
  results: SearchResult[];
  total_in_radius: number;
  resolved_location: string;
  care_need: string;
  center: { lat: number; lon: number };
}

interface ShortlistItem {
  id: string;
  facility_id: string;
  facility_name: string;
  facility_city: string | null;
  facility_state: string | null;
  facility_phone: string | null;
  note: string | null;
  distance_km: number | null;
  match_score: number;
  saved_at: string;
}

const STORAGE_KEY = 'referral_copilot_shortlist';

function loadFromStorage(): ShortlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ShortlistItem[]) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: ShortlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function ScoreBadge({ score }: { score: number }) {
  if (score === 0) {
    return <Badge variant="outline" className="text-xs text-muted-foreground">No match</Badge>;
  }
  if (score < 6) {
    return <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-100">Partial match</Badge>;
  }
  return <Badge className="text-xs bg-green-100 text-green-800 border-green-200 hover:bg-green-100">Strong match</Badge>;
}

function MissingWarning({ fields }: { fields: string[] }) {
  const important = fields.filter((f) => ['capability', 'procedure', 'equipment'].includes(f));
  if (important.length === 0) return null;
  return (
    <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>Missing data: {important.join(', ')} — contact facility to confirm.</span>
    </div>
  );
}

function ResultCard({
  result,
  shortlistId,
  onSave,
  onRemove,
}: {
  result: SearchResult;
  shortlistId: string | undefined;
  onSave: (result: SearchResult, note: string) => void;
  onRemove: (id: string) => void;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [note, setNote] = useState('');

  const specialties = result.specialties && result.specialties !== 'null'
    ? result.specialties.split(',').slice(0, 4).map((s) => s.trim()).filter(Boolean)
    : [];

  const handleSave = () => {
    onSave(result, note);
    setAddingNote(false);
    setNote('');
  };

  return (
    <Card className="shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="pt-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground leading-snug">{result.name}</p>
            {(result.address_city || result.address_stateOrRegion) && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                {[result.address_city, result.address_stateOrRegion].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className="text-xs tabular-nums">{result.distance_km} km</Badge>
            <ScoreBadge score={result.match_score} />
          </div>
        </div>

        {/* Phone */}
        {result.officialPhone && result.officialPhone !== 'null' && (
          <a
            href={`tel:${result.officialPhone}`}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Phone className="h-3 w-3 shrink-0" />
            {result.officialPhone}
          </a>
        )}

        {/* Specialties */}
        {specialties.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {specialties.map((s) => (
              <Badge key={s} className="text-xs bg-[#FF3621]/10 text-[#FF3621] border-[#FF3621]/20 hover:bg-[#FF3621]/20">
                {s}
              </Badge>
            ))}
          </div>
        )}

        {/* Missing data warnings */}
        <MissingWarning fields={result.missing_fields} />

        {/* Evidence */}
        {result.evidence.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowEvidence((v) => !v)}
              className="flex items-center gap-1 text-xs text-[#FF3621] hover:underline"
            >
              {showEvidence ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showEvidence ? 'Hide' : 'Show'} matching evidence ({result.evidence.length})
            </button>
            {showEvidence && (
              <div className="mt-2 space-y-1.5">
                {result.evidence.map((ev, i) => (
                  <p key={i} className="text-xs text-muted-foreground bg-muted/60 rounded px-2 py-1.5 leading-relaxed font-mono">
                    {ev}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Save / Remove shortlist */}
        <div className="pt-1 border-t">
          {shortlistId !== undefined ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
                <BookmarkCheck className="h-3.5 w-3.5" />
                Saved to shortlist
              </span>
              <button
                type="button"
                onClick={() => onRemove(shortlistId)}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Remove
              </button>
            </div>
          ) : addingNote ? (
            <div className="space-y-2">
              <textarea
                placeholder="Add a note (optional)…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  className="bg-[#FF3621] hover:bg-[#FF3621]/90 text-white h-7 text-xs"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setAddingNote(false); setNote(''); }}
                  className="h-7 text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingNote(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Bookmark className="h-3.5 w-3.5" />
              Save to shortlist
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ShortlistSection({
  items,
  onRemove,
}: {
  items: ShortlistItem[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/30 py-10 text-center">
        <Bookmark className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">No facilities saved yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Search for facilities and click &ldquo;Save to shortlist&rdquo;.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
        >
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground truncate">{item.facility_name}</p>
            {(item.facility_city || item.facility_state) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {[item.facility_city, item.facility_state].filter(Boolean).join(', ')}
              </p>
            )}
            {item.facility_phone && item.facility_phone !== 'null' && (
              <a href={`tel:${item.facility_phone}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-0.5">
                <Phone className="h-3 w-3" />{item.facility_phone}
              </a>
            )}
            {item.note && (
              <p className="text-xs text-muted-foreground mt-1.5 italic border-l-2 border-muted pl-2">{item.note}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {item.distance_km != null && (
                <span className="text-xs text-muted-foreground">{item.distance_km} km away</span>
              )}
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">
                {new Date(item.saved_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
            aria-label="Remove from shortlist"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ReferralSearchPage() {
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);

  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [activeTab, setActiveTab] = useState<'results' | 'shortlist'>('results');

  useEffect(() => {
    setShortlist(loadFromStorage());
  }, []);

  const shortlistByFacilityId = useMemo(
    () => new Map(shortlist.map((item) => [item.facility_id, item.id])),
    [shortlist],
  );

  const handleSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResponse(null);
    try {
      const r = await fetch('/api/referral-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await r.json() as SearchResponse & { error?: string };
      if (!r.ok) {
        setSearchError(data.error ?? 'Search failed');
        return;
      }
      setSearchResponse(data);
      setActiveTab('results');
    } catch {
      setSearchError('Search failed. Check your connection and try again.');
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  const handleSave = useCallback((result: SearchResult, note: string) => {
    const item: ShortlistItem = {
      id: `${result.unique_id}-${Date.now()}`,
      facility_id: result.unique_id,
      facility_name: result.name,
      facility_city: result.address_city,
      facility_state: result.address_stateOrRegion,
      facility_phone: result.officialPhone,
      note: note.trim() || null,
      distance_km: result.distance_km,
      match_score: result.match_score,
      saved_at: new Date().toISOString(),
    };
    setShortlist((prev) => {
      const updated = [item, ...prev.filter((i) => i.facility_id !== result.unique_id)];
      saveToStorage(updated);
      return updated;
    });
  }, []);

  const handleRemove = useCallback((id: string) => {
    setShortlist((prev) => {
      const updated = prev.filter((i) => i.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Referral Search</h2>
        <p className="text-muted-foreground mt-1">
          Find the right facility by care need and location — ranked by relevance and distance
        </p>
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={(e) => void handleSearch(e)} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="e.g. dialysis near Jaipur · emergency surgery near 110001"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              type="submit"
              disabled={searchLoading || !query.trim()}
              className="bg-[#FF3621] hover:bg-[#FF3621]/90 text-white shrink-0"
            >
              {searchLoading ? 'Searching…' : 'Search'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">
            Try: <span className="font-medium">&ldquo;dialysis near Jaipur&rdquo;</span> · <span className="font-medium">&ldquo;cardiac surgery near 400001&rdquo;</span> · <span className="font-medium">&ldquo;maternity near Patna&rdquo;</span>
          </p>
        </CardContent>
      </Card>

      {/* Error */}
      {searchError && (
        <div className="text-destructive bg-destructive/10 px-4 py-3 rounded-lg text-sm">{searchError}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setActiveTab('results')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'results'
              ? 'border-[#FF3621] text-[#FF3621]'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Results
          {searchResponse && (
            <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
              {searchResponse.results.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('shortlist')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'shortlist'
              ? 'border-[#FF3621] text-[#FF3621]'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          My Shortlist
          {shortlist.length > 0 && (
            <span className="ml-2 rounded-full bg-[#FF3621] px-1.5 py-0.5 text-xs text-white tabular-nums">
              {shortlist.length}
            </span>
          )}
        </button>
      </div>

      {/* Results tab */}
      {activeTab === 'results' && (
        <>
          {searchLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          )}

          {!searchLoading && !searchResponse && !searchError && (
            <div className="rounded-xl border bg-muted/30 py-16 text-center">
              <Search className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                Enter a care need and location above to find facilities.
              </p>
            </div>
          )}

          {!searchLoading && searchResponse && (
            <>
              {/* Summary */}
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-[#FF3621]" />
                <span>
                  <span className="font-medium text-foreground">{searchResponse.total_in_radius}</span> facilities within 50 km of{' '}
                  <span className="font-medium text-foreground">{searchResponse.resolved_location}</span>
                </span>
                <span>·</span>
                <span>
                  showing top <span className="font-medium text-foreground">{searchResponse.results.length}</span> for{' '}
                  <span className="font-medium text-foreground">&ldquo;{searchResponse.care_need}&rdquo;</span>
                </span>
              </div>

              {searchResponse.results.length === 0 ? (
                <div className="rounded-xl border bg-muted/30 py-16 text-center">
                  <p className="text-muted-foreground text-sm">No facilities found within 50 km of {searchResponse.resolved_location}.</p>
                  <p className="text-xs text-muted-foreground mt-1">Try a larger city or a different location.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {searchResponse.results.map((result) => (
                    <ResultCard
                      key={result.unique_id}
                      result={result}
                      shortlistId={shortlistByFacilityId.get(result.unique_id)}
                      onSave={handleSave}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Shortlist tab */}
      {activeTab === 'shortlist' && (
        <>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {shortlist.length} saved {shortlist.length === 1 ? 'facility' : 'facilities'}
            </CardTitle>
          </div>
          <ShortlistSection items={shortlist} onRemove={handleRemove} />
        </>
      )}
    </div>
  );
}
