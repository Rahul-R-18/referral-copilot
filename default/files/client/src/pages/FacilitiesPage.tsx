import { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  Button,
  Input,
  Badge,
  Skeleton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@databricks/appkit-ui/react';
import { Search, MapPin, Phone, Globe, Users, BedDouble, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface Facility {
  unique_id: string;
  name: string;
  organization_type: string;
  address_city: string;
  'address_stateOrRegion': string;
  'address_zipOrPostcode': string;
  specialties: string;
  capacity: string;
  numberDoctors: string;
  latitude: number;
  longitude: number;
  email: string;
  officialWebsite: string;
}

interface FacilityDetail extends Facility {
  description: string;
  address_line1: string;
  address_line2: string;
  address_country: string;
  procedure: string;
  equipment: string;
  facilityTypeId: string;
  phone_numbers: string;
  officialPhone: string;
  yearEstablished: string;
  acceptsVolunteers: string;
}

interface FacilitiesResponse {
  facilities: Facility[];
  total: number;
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

function useStates() {
  const [states, setStates] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/facilities/states/list')
      .then((r) => r.json() as Promise<string[]>)
      .then(setStates)
      .catch(() => setStates([]));
  }, []);
  return states;
}

function StatBadge({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value || value === 'null') return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{value}</span> {label}
    </span>
  );
}

function FacilityCard({
  facility,
  onClick,
}: {
  facility: Facility;
  onClick: () => void;
}) {
  const specialties = facility.specialties && facility.specialties !== 'null'
    ? facility.specialties.split(',').slice(0, 3).map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border bg-card hover:border-[#FF3621]/40 hover:shadow-md transition-all p-4 space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3621]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">{facility.name}</p>
          {facility.organization_type && facility.organization_type !== 'null' && (
            <p className="text-xs text-muted-foreground mt-0.5">{facility.organization_type}</p>
          )}
        </div>
        <Badge variant="outline" className="shrink-0 text-xs">
          {facility['address_stateOrRegion'] || '—'}
        </Badge>
      </div>

      {(facility.address_city && facility.address_city !== 'null') && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          {facility.address_city}
          {facility['address_zipOrPostcode'] && facility['address_zipOrPostcode'] !== 'null'
            ? ` · ${facility['address_zipOrPostcode']}`
            : ''}
        </p>
      )}

      {specialties.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {specialties.map((s) => (
            <Badge key={s} className="text-xs bg-[#FF3621]/10 text-[#FF3621] border-[#FF3621]/20 hover:bg-[#FF3621]/20">
              {s}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex gap-4 pt-1">
        <StatBadge label="beds" value={facility.capacity} />
        <StatBadge label="doctors" value={facility.numberDoctors} />
      </div>
    </button>
  );
}

function FacilityDrawer({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<FacilityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/facilities/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<FacilityDetail>;
      })
      .then(setDetail)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const specialties = detail?.specialties && detail.specialties !== 'null'
    ? detail.specialties.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        className="flex-1 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="w-full max-w-lg bg-background border-l shadow-xl overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-background border-b px-6 py-4 flex items-center gap-3">
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold truncate">{detail?.name ?? 'Loading…'}</h2>
        </div>

        <div className="p-6 flex-1 space-y-6">
          {loading && (
            <div className="space-y-3">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-4 w-full" />)}
            </div>
          )}

          {error && (
            <p className="text-destructive text-sm">{error}</p>
          )}

          {detail && !loading && (
            <>
              {detail.description && detail.description !== 'null' && (
                <p className="text-sm text-muted-foreground leading-relaxed">{detail.description}</p>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Location</h3>
                <p className="text-sm text-muted-foreground">
                  {[detail.address_line1, detail.address_line2, detail.address_city, detail['address_stateOrRegion']]
                    .filter((v) => v && v !== 'null')
                    .join(', ')}
                  {detail['address_zipOrPostcode'] && detail['address_zipOrPostcode'] !== 'null'
                    ? ` — ${detail['address_zipOrPostcode']}`
                    : ''}
                </p>
                {detail.latitude && detail.longitude && (
                  <a
                    href={`https://maps.google.com/?q=${detail.latitude},${detail.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#FF3621] hover:underline"
                  >
                    <MapPin className="h-3 w-3" /> View on map
                  </a>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {detail.capacity && detail.capacity !== 'null' && (
                  <div className="flex items-center gap-2">
                    <BedDouble className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Capacity</p>
                      <p className="text-sm font-medium">{detail.capacity} beds</p>
                    </div>
                  </div>
                )}
                {detail.numberDoctors && detail.numberDoctors !== 'null' && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">Doctors</p>
                      <p className="text-sm font-medium">{detail.numberDoctors}</p>
                    </div>
                  </div>
                )}
              </div>

              {specialties.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Specialties</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {specialties.map((s) => (
                      <Badge key={s} className="text-xs bg-[#FF3621]/10 text-[#FF3621] border-[#FF3621]/20">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {detail.procedure && detail.procedure !== 'null' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-foreground">Procedures</h3>
                  <p className="text-sm text-muted-foreground">{detail.procedure}</p>
                </div>
              )}

              <div className="space-y-2">
                {(detail.officialPhone && detail.officialPhone !== 'null') && (
                  <a
                    href={`tel:${detail.officialPhone}`}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="h-4 w-4 shrink-0" />
                    {detail.officialPhone}
                  </a>
                )}
                {(detail.officialWebsite && detail.officialWebsite !== 'null') && (
                  <a
                    href={detail.officialWebsite.startsWith('http') ? detail.officialWebsite : `https://${detail.officialWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-[#FF3621] hover:underline"
                  >
                    <Globe className="h-4 w-4 shrink-0" />
                    Website
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function FacilitiesPage() {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<FacilitiesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const states = useStates();

  const fetchFacilities = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (query) params.set('q', query);
    if (state) params.set('state', state);
    if (specialty) params.set('specialty', specialty);

    fetch(`/api/facilities?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json() as Promise<FacilitiesResponse>;
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [query, state, specialty, page]);

  useEffect(() => {
    fetchFacilities();
  }, [fetchFacilities]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchFacilities();
  };

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Find a Facility</h2>
        <p className="text-muted-foreground mt-1">
          Search across healthcare facilities for patient referrals
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or description…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={state} onValueChange={(v) => { setState(v === '_all' ? '' : v); setPage(0); }}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All states</SelectItem>
                {states.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Specialty…"
              value={specialty}
              onChange={(e) => { setSpecialty(e.target.value); setPage(0); }}
              className="w-full sm:w-40"
            />
            <Button type="submit" className="bg-[#FF3621] hover:bg-[#FF3621]/90 text-white shrink-0">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <div className="text-destructive bg-destructive/10 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && data && (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total.toLocaleString()} facilities found
            {data.total > 0 && ` · showing ${data.offset + 1}–${Math.min(data.offset + PAGE_SIZE, data.total)}`}
          </p>

          {data.facilities.length === 0 ? (
            <p className="text-center py-16 text-muted-foreground">No facilities match your search.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.facilities.map((f) => (
                <FacilityCard key={f.unique_id} facility={f} onClick={() => setSelectedId(f.unique_id)} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {selectedId && (
        <FacilityDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
