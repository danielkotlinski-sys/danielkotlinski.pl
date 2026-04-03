'use client';

import {
  Button,
  Card,
  Badge,
  Input,
  StatCard,
  SectionHeader,
  Sidebar,
  TopNav,
  Table,
} from '@/components/ds';

/* ------------------------------------------------------------------ */
/*  Icon helpers (inline SVG to avoid deps)                           */
/* ------------------------------------------------------------------ */
const IconGrid = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="1" width="6" height="6" /><rect x="9" y="1" width="6" height="6" />
    <rect x="1" y="9" width="6" height="6" /><rect x="9" y="9" width="6" height="6" />
  </svg>
);
const IconScan = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M1 5V1h4M11 1h4v4M15 11v4h-4M5 15H1v-4" /><line x1="1" y1="8" x2="15" y2="8" />
  </svg>
);
const IconArchive = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="1" width="14" height="4" /><path d="M2 5v10h12V5" /><line x1="6" y1="8" x2="10" y2="8" />
  </svg>
);
const IconSettings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13" />
  </svg>
);
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="7" cy="7" r="5" /><line x1="11" y1="11" x2="15" y2="15" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Sample data                                                       */
/* ------------------------------------------------------------------ */
const sidebarItems = [
  { label: 'Overview', icon: <IconGrid />, href: '#' },
  { label: 'My Scans', icon: <IconScan />, active: true },
  { label: 'Archetypes', icon: <IconGrid /> },
  { label: 'Archive', icon: <IconArchive /> },
  { label: 'Settings', icon: <IconSettings /> },
];

const topLinks = [
  { label: 'Methodology', href: '#', active: true },
  { label: 'Archetypes', href: '#' },
  { label: 'The Oracle', href: '#' },
];

type ScanRow = {
  category: string;
  id: string;
  url: string;
  status: string;
  date: string;
};

const scanColumns = [
  {
    key: 'category',
    header: 'Category Identity',
    render: (row: ScanRow) => (
      <div>
        <div className="font-semibold text-cs-fg">{row.category}</div>
        <div className="text-cs-xs text-cs-fg-dim">ID: {row.id}</div>
      </div>
    ),
  },
  { key: 'url', header: 'Target URL' },
  {
    key: 'status',
    header: 'Current Status',
    render: (row: ScanRow) => (
      <Badge variant={row.status === 'COMPLETE' ? 'complete' : row.status === 'PENDING' ? 'pending' : 'active'}>
        {row.status}
      </Badge>
    ),
  },
  { key: 'date', header: 'Ledger Date' },
];

const scanData: ScanRow[] = [
  { category: 'Plant-Based Meat', id: 'SCAN-882-PBM', url: 'impossiblefoods.com', status: 'COMPLETE', date: 'OCT 12, 2023' },
  { category: 'Neo-Banking', id: 'SCAN-441-NBK', url: 'revolut.com', status: 'ACTIVE', date: 'OCT 14, 2023' },
  { category: 'Web3 Infrastructure', id: 'SCAN-092-W3I', url: 'alchemy.com', status: 'PENDING', date: 'OCT 14, 2023' },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function DesignSystemPage() {
  return (
    <div className="cs min-h-screen">
      {/* ======== LANDING NAV PREVIEW ======== */}
      <section className="mb-16">
        <div className="cs-label px-8 py-3 bg-cs-bg-alt border-b border-cs-border">
          Component: TopNav (Landing)
        </div>
        <TopNav
          links={topLinks}
          actions={<Button size="sm">Log In</Button>}
        />
      </section>

      {/* ======== MAIN LAYOUT: SIDEBAR + CONTENT ======== */}
      <div className="flex">
        {/* Sidebar */}
        <div className="w-[240px] flex-shrink-0 relative">
          <div className="cs-label px-4 py-2 bg-cs-bg-alt border-b border-cs-border">
            Component: Sidebar
          </div>
          <div className="h-[600px] relative border border-cs-border">
            <Sidebar
              items={sidebarItems}
              version="V1.02 LEDGER"
              className="!fixed !relative h-full"
              footer={
                <div>
                  <Button variant="primary" size="md" className="w-full mb-3">
                    New Scan
                  </Button>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-cs-bg-alt border border-cs-border flex items-center justify-center">
                      <span className="text-cs-xs font-bold">A</span>
                    </div>
                    <div>
                      <div className="text-cs-xs font-semibold uppercase">Archivist-01</div>
                      <div className="text-cs-xs text-cs-fg-dim">Node Status: Active</div>
                    </div>
                  </div>
                </div>
              }
            />
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 px-10 py-8 space-y-16 max-w-5xl">

          {/* --- STAT CARDS --- */}
          <section>
            <div className="cs-label mb-4">Component: StatCard</div>
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Total Active Scans" value="12" change="+2 Today" />
              <StatCard label="Category Maps" value="148" />
              <StatCard
                label="Available Credits"
                value="4.2k"
                action={<Button variant="secondary" size="sm">Refill</Button>}
              />
            </div>
          </section>

          {/* --- SECTION HEADER --- */}
          <section>
            <div className="cs-label mb-4">Component: SectionHeader</div>
            <SectionHeader
              prefix="SYSTEM_LOGS"
              title="Scanned_Entities"
              subtitle="Real-time market architecture analysis"
              action={<Button size="md">+ Initiate New Magic Scan</Button>}
            />
          </section>

          {/* --- TABLE --- */}
          <section>
            <div className="cs-label mb-4">Component: Table</div>
            <Table columns={scanColumns} data={scanData} onRowClick={() => {}} />
          </section>

          {/* --- BUTTONS --- */}
          <section>
            <div className="cs-label mb-4">Component: Button</div>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="primary" loading>Loading</Button>
              <Button variant="primary" disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-4">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
          </section>

          {/* --- BADGES --- */}
          <section>
            <div className="cs-label mb-4">Component: Badge</div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Default</Badge>
              <Badge variant="active">Active_Sequence</Badge>
              <Badge variant="pending">Pending_Approval</Badge>
              <Badge variant="complete">Complete</Badge>
              <Badge variant="error">Error</Badge>
            </div>
          </section>

          {/* --- INPUT --- */}
          <section>
            <div className="cs-label mb-4">Component: Input</div>
            <div className="max-w-lg space-y-4">
              <Input placeholder="Input_URL_for_system_analysis..." icon={<IconSearch />} />
              <Input label="Target_Domain" placeholder="example.com" />
              <Input label="Query_Ledger" placeholder="Search..." />
            </div>
          </section>

          {/* --- CARDS --- */}
          <section>
            <div className="cs-label mb-4">Component: Card</div>
            <div className="grid grid-cols-2 gap-4">
              <Card variant="default">
                <div className="cs-label mb-2">Default Card</div>
                <p className="text-cs-sm text-cs-fg-muted">
                  Standard card with light border. Used for content sections.
                </p>
              </Card>
              <Card variant="bordered">
                <div className="cs-label mb-2">Bordered Card</div>
                <p className="text-cs-sm text-cs-fg-muted">
                  Bold border variant. Used for emphasis.
                </p>
              </Card>
              <Card variant="dark">
                <div className="cs-label mb-2 text-cs-fg-dim">Dark Card</div>
                <p className="text-cs-sm text-cs-fg-dim">
                  Inverted dark variant. Used for hero sections and CTAs.
                </p>
              </Card>
              <Card variant="stat">
                <div className="cs-stat-label mb-2">Stat Card Shell</div>
                <span className="cs-stat">42</span>
              </Card>
            </div>
          </section>

          {/* --- ACTIVITY LOG (composite) --- */}
          <section>
            <SectionHeader prefix="SYSTEM_LOGS" title="Current_Activity" className="mb-4" />
            <Card variant="default" padding="none">
              {[
                { node: 'NODE_002', op: 'STRUCTURAL_SCAN', status: 'ACTIVE_SEQUENCE', time: '09:42:11' },
                { node: 'NODE_114', op: 'LEDGER_SYNC', status: 'COMPLETE', time: '08:15:30' },
                { node: 'NODE_003', op: 'SYNTHESIS_INIT', status: 'PENDING_APPROVAL', time: '07:22:04' },
              ].map((log, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-5 py-4 border-b border-cs-border last:border-b-0 hover:bg-cs-bg-alt transition-colors"
                >
                  <span className="text-cs-sm text-cs-fg-muted w-24">{log.node}</span>
                  <span className="text-cs-sm font-semibold flex-1">{log.op}</span>
                  <span className="text-cs-xs text-cs-fg-muted flex-1">{log.status}</span>
                  <span className="text-cs-sm font-medium text-cs-red">{log.time}</span>
                </div>
              ))}
            </Card>
          </section>

          {/* --- CTA SECTION (composite) --- */}
          <section>
            <div className="cs-label mb-4">Composite: CTA Block</div>
            <Card variant="dark" padding="lg">
              <div className="text-center py-8">
                <div className="w-3 h-3 bg-cs-fg-inv mb-4 mx-auto" />
                <h2 className="font-mono text-cs-3xl font-bold uppercase tracking-wider text-cs-fg-inv mb-3">
                  Join_the_Architectural_Elite
                </h2>
                <p className="font-mono text-cs-sm text-cs-fg-dim mb-8">
                  Access the secure ledger and begin your synthesis process today.<br />
                  Limited archival nodes available.
                </p>
                <div className="flex items-center justify-center gap-4">
                  <Button variant="danger" size="lg">Request_Access</Button>
                  <Button variant="secondary" size="lg" className="!border-cs-fg-dim !text-cs-fg-inv hover:!bg-cs-fg-inv/10">
                    View_Protocol
                  </Button>
                </div>
              </div>
            </Card>
          </section>

          {/* --- COLOR PALETTE --- */}
          <section className="pb-16">
            <div className="cs-label mb-4">Design Tokens: Colors</div>
            <div className="grid grid-cols-5 gap-3">
              {[
                { name: 'cs-bg',       hex: '#f5f3f0', cls: 'bg-cs-bg border border-cs-border' },
                { name: 'cs-bg-alt',   hex: '#eae7e3', cls: 'bg-cs-bg-alt border border-cs-border' },
                { name: 'cs-bg-card',  hex: '#ffffff', cls: 'bg-cs-bg-card border border-cs-border' },
                { name: 'cs-fg',       hex: '#0d0d0d', cls: 'bg-cs-fg' },
                { name: 'cs-red',      hex: '#c0392b', cls: 'bg-cs-red' },
                { name: 'cs-green',    hex: '#27ae60', cls: 'bg-cs-green' },
                { name: 'cs-fg-muted', hex: '#6b6b6b', cls: 'bg-cs-fg-muted' },
                { name: 'cs-fg-dim',   hex: '#999999', cls: 'bg-cs-fg-dim' },
                { name: 'cs-border',   hex: '#d0ccc8', cls: 'bg-cs-border' },
                { name: 'cs-bg-dark',  hex: '#1a1a1a', cls: 'bg-cs-bg-dark' },
              ].map((c) => (
                <div key={c.name} className="text-center">
                  <div className={`w-full h-12 rounded-cs-none ${c.cls}`} />
                  <div className="text-cs-xs mt-1.5 font-medium">{c.name}</div>
                  <div className="text-cs-xs text-cs-fg-dim">{c.hex}</div>
                </div>
              ))}
            </div>
          </section>

          {/* --- TYPOGRAPHY --- */}
          <section className="pb-16">
            <div className="cs-label mb-4">Design Tokens: Typography</div>
            <div className="space-y-3">
              <div className="text-cs-hero font-bold uppercase">cs-hero / 56px</div>
              <div className="text-cs-3xl font-bold uppercase">cs-3xl / 40px</div>
              <div className="text-cs-2xl font-bold uppercase">cs-2xl / 32px</div>
              <div className="text-cs-xl font-semibold uppercase">cs-xl / 24px</div>
              <div className="text-cs-lg font-semibold uppercase">cs-lg / 18px</div>
              <div className="text-cs-md">cs-md / 15px — body text</div>
              <div className="text-cs-base">cs-base / 13px — default</div>
              <div className="text-cs-sm text-cs-fg-muted">cs-sm / 12px — secondary</div>
              <div className="text-cs-xs text-cs-fg-dim">cs-xs / 11px — labels, captions</div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
