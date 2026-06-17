import { createBrowserRouter, RouterProvider, NavLink, Outlet } from 'react-router';
import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  useIsMobile,
  Button,
  Skeleton,
} from '@databricks/appkit-ui/react';
import { Menu, Hospital, MapPin, Search, Navigation } from 'lucide-react';
import { FacilitiesPage } from './pages/FacilitiesPage';
import { DistrictsPage } from './pages/DistrictsPage';
import { PincodePage } from './pages/PincodePage';
import { ReferralSearchPage } from './pages/ReferralSearchPage';

interface Stats {
  facilities: number;
  districts: number;
  pincodes: number;
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-[#FF3621] text-white'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }`;

type NavLinkClassFn = (props: { isActive: boolean }) => string;

function NavLinks({
  className,
  linkClass,
  onClick,
}: {
  className?: string;
  linkClass: NavLinkClassFn;
  onClick?: () => void;
}) {
  return (
    <nav className={className}>
      <NavLink to="/" end className={linkClass} onClick={onClick}>
        Home
      </NavLink>
      <NavLink to="/search" className={linkClass} onClick={onClick}>
        Referral Search
      </NavLink>
      <NavLink to="/facilities" className={linkClass} onClick={onClick}>
        Facilities
      </NavLink>
      <NavLink to="/districts" className={linkClass} onClick={onClick}>
        Districts
      </NavLink>
      <NavLink to="/pincode" className={linkClass} onClick={onClick}>
        Pincode
      </NavLink>
    </nav>
  );
}

function Layout() {
  const isMobile = useIsMobile();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  return (
    <div className="min-h-screen bg-[#F9F7F4] flex flex-col">
      <header className="bg-[#0B2026] text-white px-4 md:px-6 py-3 flex items-center gap-4 shadow-sm">
        <div className="flex items-center gap-2 shrink-0">
          <Hospital className="h-5 w-5 text-[#FF3621]" />
          <h1 className="text-base font-semibold">Referral Copilot</h1>
        </div>
        <NavLinks className="hidden md:flex gap-1" linkClass={navLinkClass} />
        <div className="ml-auto md:hidden">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMobileNavOpen(true)}
              className="text-white hover:bg-white/10"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
            <SheetContent side="left">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Hospital className="h-4 w-4 text-[#FF3621]" />
                  Referral Copilot
                </SheetTitle>
              </SheetHeader>
              <NavLinks
                className="flex flex-col gap-1 mt-4"
                linkClass={mobileNavLinkClass}
                onClick={() => setMobileNavOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <Card className="shadow-sm">
      <CardContent className="pt-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-[#FF3621]/10 flex items-center justify-center shrink-0">
            <Icon className="h-5 w-5 text-[#FF3621]" />
          </div>
          <div>
            {loading ? (
              <Skeleton className="h-7 w-16 mb-1" />
            ) : (
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {value?.toLocaleString() ?? '—'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/stats')
      .then((r) => r.json() as Promise<Stats>)
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const syncing = !loading && (!stats || stats.facilities === 0);

  return (
    <div className="space-y-8 mt-2">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Referral Copilot</h2>
        <p className="text-muted-foreground mt-1 text-lg">
          Find and refer patients to the right healthcare facilities across India
        </p>
        <Badge className="mt-2 bg-[#FF3621]/10 text-[#FF3621] border-[#FF3621]/20">
          Powered by Databricks Lakebase · sub-10ms reads
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Hospital} label="Healthcare facilities" value={stats?.facilities} loading={loading} />
        <StatCard icon={MapPin} label="Districts with NFHS-5 data" value={stats?.districts} loading={loading} />
        <StatCard icon={Search} label="Unique pincodes" value={stats?.pincodes} loading={loading} />
      </div>

      {syncing && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <p className="text-sm text-amber-800">
              <span className="font-semibold">Data sync in progress.</span> The hackathon dataset is being
              synced from Unity Catalog into Lakebase. This usually takes a few minutes — check back shortly
              and refresh the page.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow border-[#FF3621]/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-4 w-4 text-[#FF3621]" />
              Referral Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Natural language search &mdash; &ldquo;dialysis near Jaipur&rdquo; &mdash; ranked by care match and distance within 50 km.
            </p>
            <NavLink
              to="/search"
              className="text-sm font-medium text-[#FF3621] hover:underline"
            >
              Start searching →
            </NavLink>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Hospital className="h-4 w-4 text-[#FF3621]" />
              Find Facilities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Search by name, specialty, or state. View capacity, doctor count, and contact details.
            </p>
            <NavLink
              to="/facilities"
              className="text-sm font-medium text-[#FF3621] hover:underline"
            >
              Search facilities →
            </NavLink>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4 text-[#FF3621]" />
              District Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              NFHS-5 public health indicators — institutional births, vaccination, insurance coverage and more.
            </p>
            <NavLink
              to="/districts"
              className="text-sm font-medium text-[#FF3621] hover:underline"
            >
              View indicators →
            </NavLink>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-[#FF3621]" />
              Pincode Lookup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Look up any 6-digit Indian pincode to find post offices and district context for referrals.
            </p>
            <NavLink
              to="/pincode"
              className="text-sm font-medium text-[#FF3621] hover:underline"
            >
              Look up pincode →
            </NavLink>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/search', element: <ReferralSearchPage /> },
      { path: '/facilities', element: <FacilitiesPage /> },
      { path: '/districts', element: <DistrictsPage /> },
      { path: '/pincode', element: <PincodePage /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
