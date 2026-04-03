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
/*  Icons (inline SVG)                                                */
/* ------------------------------------------------------------------ */
const IconScan = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M1 5V1h4M9 1h4v4M13 9v4h-4M5 13H1V9" /><line x1="1" y1="7" x2="13" y2="7" />
  </svg>
);
const IconGrid = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1" y="1" width="5" height="5" /><rect x="8" y="1" width="5" height="5" />
    <rect x="1" y="8" width="5" height="5" /><rect x="8" y="8" width="5" height="5" />
  </svg>
);
const IconVault = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="1" y="1" width="12" height="3.5" /><path d="M2 4.5v8.5h10V4.5" /><line x1="5" y1="7" x2="9" y2="7" />
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
    <circle cx="7" cy="7" r="2.5" /><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.2 1.2M9.8 9.8L11 11M11 3l-1.2 1.2M4.2 9.8L3 11" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Data                                                              */
/* ------------------------------------------------------------------ */
const sidebarItems = [
  { label: 'Initiate_Scan', icon: <IconScan /> },
  { label: 'Core_Logic', icon: <IconGrid />, active: true },
  { label: 'Data_Models', icon: <IconGrid /> },
  { label: 'Fragment_Vault', icon: <IconVault /> },
  { label: 'Protocol_X', icon: <IconSettings /> },
];

type ScanRow = { entity: string; id: string; status: string; timestamp: string };

const tableColumns = [
  {
    key: 'entity',
    header: 'Entity',
    render: (row: ScanRow) => (
      <div>
        <div className="font-semibold font-display">{row.entity}</div>
        <div className="text-[0.5625rem] text-cs-silver tracking-[0.12em] uppercase mt-0.5">ID: {row.id}</div>
      </div>
    ),
  },
  { key: 'status', header: 'Status' },
  { key: 'timestamp', header: 'Timestamp', align: 'right' as const },
];

const tableData: ScanRow[] = [
  { entity: 'DATA_NODE_7', id: 'SCAN-882', status: 'COMPLETE', timestamp: '09:42:11' },
  { entity: 'ARCH_SCAN_3', id: 'SCAN-441', status: 'ACTIVE', timestamp: '08:15:30' },
  { entity: 'SYNTHESIS_X', id: 'SCAN-092', status: 'PENDING', timestamp: '07:22:04' },
];

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */
export default function DesignSystemPage() {
  return (
    <div className="cs min-h-screen flex">
      {/* Sidebar */}
      <div className="w-[200px] flex-shrink-0 relative">
        <div className="h-screen relative border border-cs-border">
          <Sidebar
            items={sidebarItems}
            version="V.01_ARCHITECTURAL_TRUTH"
            className="!fixed !relative h-full"
            footer={
              <div>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver">SYSTEM/STATUS</div>
                <div className="font-mono text-[0.6875rem] font-semibold uppercase">OPERATIONAL</div>
              </div>
            }
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <TopNav
          links={[
            { label: 'Neural_Map', href: '#', active: true },
            { label: 'Archive_01', href: '#' },
            { label: 'System_Logs', href: '#' },
          ]}
          actions={
            <input
              type="text"
              placeholder="QUERY_DATABASE"
              className="font-mono text-[0.625rem] border border-cs-border px-3 py-1.5 bg-cs-canvas text-cs-silver uppercase tracking-[0.1em] w-40 focus:outline-none focus:border-cs-black focus:text-cs-black"
            />
          }
        />

        <div className="flex-1 p-10 max-w-[880px]">

          {/* 01 — Core Identity */}
          <div className="mb-20">
            <SectionHeader number="01" title="CORE_IDENTITY" />
            <div className="flex gap-4 mb-6">
              <div className="w-60 h-44 border-2 border-cs-black flex flex-col items-center justify-center gap-3">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor">
                  <rect x="12" y="12" width="24" height="24" transform="rotate(45 24 24)" />
                </svg>
                <span className="font-display text-2xl font-bold tracking-[0.06em]">CATSCAN</span>
              </div>
              <div className="w-[100px] h-[100px] bg-cs-black text-cs-white flex items-center justify-center font-display text-[2.5rem] font-bold border-2 border-cs-black">C</div>
              <div className="w-[100px] h-[100px] bg-cs-black text-cs-white flex items-center justify-center font-display text-[2.5rem] font-bold border-2 border-cs-black">S</div>
            </div>
            <p className="font-editorial text-base leading-relaxed max-w-[400px] text-cs-gray">
              The visual anchor of the system. A signet born from Euclidean geometry
              and a logotype that demands absolute attention.
            </p>
          </div>

          {/* 02 — Visual Grammar */}
          <div className="mb-20">
            <SectionHeader number="02" title="VISUAL_GRAMMAR" />
            <div className="grid grid-cols-3 border border-cs-border">
              <div className="bg-cs-black text-cs-white p-5 flex flex-col justify-end min-h-[100px] border-r border-cs-border">
                <div className="font-mono text-[0.625rem] uppercase tracking-[0.1em] mb-0.5">Pure Black</div>
                <div className="font-mono text-sm font-semibold">#000000</div>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mt-1">PRIMARY_INK</div>
              </div>
              <div className="bg-cs-canvas p-5 flex flex-col justify-end min-h-[100px] border-r border-cs-border">
                <div className="font-mono text-[0.625rem] uppercase tracking-[0.1em] mb-0.5">The Canvas</div>
                <div className="font-mono text-sm font-semibold">#FAF0F5</div>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mt-1">ARCHITECTURAL_BONE</div>
              </div>
              <div className="bg-cs-white p-5 flex flex-col justify-end min-h-[100px]">
                <div className="font-mono text-[0.625rem] uppercase tracking-[0.1em] mb-0.5">Paper White</div>
                <div className="font-mono text-sm font-semibold">#FFFFFF</div>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mt-1">LOGIC_BLOCKS</div>
              </div>
            </div>
          </div>

          {/* 03 — Typography */}
          <div className="mb-20">
            <SectionHeader number="03" title="TYPOGRAPHIC_HIERARCHY" />
            <div className="grid grid-cols-2 gap-12 mb-10">
              <div>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-3">DISPLAY_TYPE / SPACE GROTESK</div>
                <div className="font-display text-[4rem] font-bold leading-none tracking-[-0.03em] mb-2">CATEGORY<br/>DECODER</div>
                <p className="font-editorial text-sm leading-relaxed text-cs-gray">
                  Engineered for legibility and technical authority. Used
                  for all navigation, data labels, and structural anchors.
                </p>
              </div>
              <div>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-3">EDITORIAL_TYPE / NEWSREADER</div>
                <div className="font-editorial italic text-[2rem] leading-[1.25] mb-2">
                  The diagnostic synthesis of architectural tropes.
                </div>
                <p className="font-editorial text-sm leading-relaxed text-cs-gray">
                  For the human element. Providing historical context, analytical
                  insights, and the voice of truth within the machine.
                </p>
              </div>
            </div>
          </div>

          {/* 04 — Components */}
          <div className="mb-20">
            <SectionHeader number="04" title="COMPONENT_BLUEPRINTS" />
            <div className="grid grid-cols-3 gap-8">
              {/* Buttons */}
              <div>
                <h4 className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] font-semibold text-cs-gray mb-4">BUTTON_STATES</h4>
                <div className="flex flex-col gap-2">
                  <Button variant="primary" className="w-full">Initiate_Scan</Button>
                  <Button variant="secondary" className="w-full">Secondary_Action</Button>
                  <Button variant="disabled" className="w-full">Locked_Protocol</Button>
                </div>
              </div>

              {/* Inputs */}
              <div>
                <h4 className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] font-semibold text-cs-gray mb-4">INPUT_FIELDS</h4>
                <div className="flex flex-col gap-3">
                  <Input label="ENTITY_NAME" defaultValue="ARCHITECT_01" />
                  <div className="flex flex-col gap-1.5">
                    <span className="inline-block self-start font-mono text-[0.5rem] font-semibold uppercase tracking-[0.12em] bg-cs-canvas border border-cs-border px-1.5 py-0.5">LOG_LEVEL</span>
                    <select className="w-full font-mono text-[0.75rem] tracking-[0.04em] bg-cs-white border border-cs-border px-3 py-2 appearance-none focus:outline-none focus:border-cs-black">
                      <option>CRITICAL_THINKING</option>
                      <option>STRUCTURAL_SCAN</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Card */}
              <div>
                <h4 className="font-mono text-[0.5625rem] uppercase tracking-[0.12em] font-semibold text-cs-gray mb-4">STRUCTURAL_CARDS</h4>
                <Card>
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-display text-[0.9375rem] font-bold uppercase">DATA_NODE_7</span>
                    <Badge>EN</Badge>
                  </div>
                  <p className="font-editorial text-[0.75rem] leading-relaxed text-cs-gray mb-3">
                    Integrity check completed. 0 cliches detected in the architectural substrate. Ready for export.
                  </p>
                  <div className="flex justify-between border-t border-cs-border pt-2">
                    <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-cs-silver">TIMESTAMP: 04.03.X</span>
                    <span className="font-mono text-[0.5rem] uppercase tracking-[0.12em] text-cs-silver">STATUS: OK</span>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* 05 — Patterns */}
          <div className="mb-20">
            <SectionHeader number="05" title="ARCHITECTURAL_PATTERNS" />
            <div className="grid grid-cols-3 gap-4">
              <div className="aspect-[4/3] border border-cs-border" style={{ background: 'repeating-linear-gradient(90deg,#000 0px,#000 8px,#fff 8px,#fff 16px)' }} />
              <div className="aspect-[4/3] border border-cs-border bg-cs-white flex items-center justify-center">
                <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="10" y="10" width="40" height="40" transform="rotate(45 30 30)" />
                  <rect x="18" y="18" width="24" height="24" transform="rotate(45 30 30)" />
                </svg>
              </div>
              <div className="aspect-[4/3] border border-cs-border bg-cs-black relative">
                <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-cs-white" />
                <div className="absolute bottom-[33%] left-0 w-[60%] h-[15%] bg-cs-white" />
              </div>
            </div>
          </div>

          {/* 06 — Manifesto */}
          <div className="mb-20">
            <SectionHeader number="06" title="THE_DIGITAL_LEDGER" />
            <Card variant="bordered" padding="none">
              <div className="grid grid-cols-[1.2fr_0.8fr]">
                <div className="p-8">
                  <h3 className="font-display text-[1.375rem] font-bold leading-snug mb-5">THE TRUTH IS IN THE STRUCTURE.</h3>
                  <p className="font-editorial text-[0.9375rem] leading-relaxed mb-5 text-cs-ink">
                    &ldquo;We do not simplify information; we reveal its hierarchy.
                    Every pixel must serve a structural purpose. If a line exists,
                    it is an immutable boundary.&rdquo;
                  </p>
                  <div className="border-l-2 border-cs-black pl-3">
                    <div className="font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-cs-gray leading-[1.8]">
                      // PRINCIPLE_01: ABSOLUTE_CLARITY<br />
                      // PRINCIPLE_02: NO_SOFTNESS_PERMITTED<br />
                      // PRINCIPLE_03: TECHNICAL_AUTHORITY
                    </div>
                  </div>
                </div>
                <div className="border-l-2 border-cs-black flex flex-col">
                  <div className="bg-cs-black text-cs-white p-4 border-b border-cs-border">
                    <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-1">MICRO_COPY_SAMPLE_A</div>
                    <div className="font-display text-[0.8125rem] font-bold uppercase tracking-[0.02em]">SYSTEM STABLE //<br/>NO CLICHE DETECTED</div>
                  </div>
                  <div className="p-4 border-b border-cs-border">
                    <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-1">MICRO_COPY_SAMPLE_B</div>
                    <div className="font-display text-[0.8125rem] font-bold uppercase tracking-[0.02em]">DECODE THE CATEGORY</div>
                  </div>
                  <div className="p-4">
                    <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-1">MICRO_COPY_SAMPLE_C</div>
                    <div className="font-display text-[0.8125rem] font-bold uppercase tracking-[0.02em]">INITIATE_SCAN</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Table */}
          <div className="mb-20">
            <SectionHeader number="07" title="DATA_LEDGER" />
            <Table columns={tableColumns} data={tableData} onRowClick={() => {}} />
          </div>

          {/* Stat Cards */}
          <div className="mb-20">
            <SectionHeader number="08" title="METRIC_DISPLAYS" />
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Active Scans" value="12" />
              <StatCard label="Category Maps" value="148" />
              <StatCard label="System Uptime" value="99.7%" />
            </div>
          </div>

        </div>

        {/* Footer */}
        <footer className="bg-cs-black text-cs-white p-10">
          <div className="font-display text-2xl font-bold uppercase mb-1">CATSCAN_OS</div>
          <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-8">
            REJECTING_THE_SAAS_AESTHETIC_SINCE_2024
          </div>
          <div className="grid grid-cols-4 gap-6">
            {[
              ['LOCATION', 'SEC_42_CLOUD'],
              ['VERSION', 'V0.1.4_BETA'],
              ['AUTHORITY', 'ROOT_ACCESS'],
              ['STATUS', 'SECURED'],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="font-mono text-[0.5rem] uppercase tracking-[0.14em] text-cs-silver mb-1">{label}</div>
                <div className="font-mono text-[0.625rem] uppercase tracking-[0.08em]">{value}</div>
              </div>
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}
