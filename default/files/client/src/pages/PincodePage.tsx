import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Badge,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { MapPin, Search } from 'lucide-react';

interface PostOffice {
  officename: string;
  officetype: string;
  delivery: string;
  district: string;
  statename: string;
  pincode: number;
  latitude: string;
  longitude: string;
  circlename: string;
  divisionname: string;
}

export function PincodePage() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<PostOffice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const pin = input.replace(/\D/g, '');
    if (pin.length !== 6) {
      setError('Enter a valid 6-digit pincode');
      return;
    }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const r = await fetch(`/api/pincode/${pin}`);
      if (!r.ok) {
        const body = await r.json() as { error?: string };
        throw new Error(body.error ?? r.statusText);
      }
      const data = await r.json() as PostOffice[];
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const district = results?.[0]?.district;
  const state = results?.[0]?.statename;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Pincode Lookup</h2>
        <p className="text-muted-foreground mt-1">
          Find post offices and district context for any Indian pincode
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <form onSubmit={lookup} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter 6-digit pincode…"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
                }}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
                className="pl-9 text-lg tracking-widest"
              />
            </div>
            <Button
              type="submit"
              disabled={loading || input.replace(/\D/g, '').length !== 6}
              className="bg-[#FF3621] hover:bg-[#FF3621]/90 text-white"
            >
              {loading ? 'Looking up…' : 'Look up'}
            </Button>
          </form>
          {error && (
            <p className="text-destructive text-sm mt-2">{error}</p>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      )}

      {results && !loading && (
        <>
          {results.length === 0 ? (
            <p className="text-center py-12 text-muted-foreground">No post offices found for this pincode.</p>
          ) : (
            <div className="space-y-4">
              <Card className="border-[#FF3621]/20 bg-[#FF3621]/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#FF3621]" />
                    {district} — {state}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Pincode <span className="font-semibold text-foreground">{results[0].pincode}</span> covers{' '}
                    <span className="font-semibold text-foreground">{results.length}</span> post office
                    {results.length !== 1 ? 's' : ''} in {district}.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {results.map((po) => (
                  <div
                    key={po.officename}
                    className="flex items-start justify-between gap-3 rounded-lg border bg-card px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground text-sm">{po.officename}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{po.divisionname}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant="outline" className="text-xs">{po.officetype}</Badge>
                      {po.delivery === 'Delivery' && (
                        <span className="text-xs text-green-600 font-medium">Delivery</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
