'use client';

import { useState } from 'react';
import type { PerceptualMapData } from '@/types/scanner';

interface PerceptualMapProps {
  data: PerceptualMapData;
  clientBrandName: string;
}

const BRAND_COLORS = [
  '#E8734A', // dk-orange
  '#2A9D8F', // dk-teal
  '#6366F1', // indigo
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#EF4444', // red
];

export default function PerceptualMap({ data, clientBrandName }: PerceptualMapProps) {
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);

  const padding = 60;
  const width = 500;
  const height = 500;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  // Horizontal breathing room for edge-anchored axis labels (osX.lewy / osX.prawy).
  // Labels like "Korporacyjny" or "Technologia potwierdzona dekadami badań" used
  // to clip against the viewBox — we extend the viewBox outward so they can
  // overflow the chart area without getting cut off.
  const labelMargin = 110;

  // Convert -10..10 to pixel coordinates
  const toX = (val: number) => padding + ((val + 10) / 20) * innerW;
  const toY = (val: number) => padding + ((10 - val) / 20) * innerH; // invert Y

  return (
    <div className="bg-white rounded-card p-6 md:p-8">
      <p className="text-xs text-dk-teal uppercase tracking-widest font-medium mb-5">
        Mapa percepcyjna kategorii
      </p>
      <div className="flex justify-center">
        <svg
          viewBox={`${-labelMargin} 0 ${width + labelMargin * 2} ${height}`}
          className="w-full max-w-[640px]"
          style={{ fontFamily: 'inherit', overflow: 'visible' }}
        >
          {/* Background */}
          <rect x={padding} y={padding} width={innerW} height={innerH} fill="#FAFAF5" rx="4" />

          {/* Grid lines */}
          {[-5, 0, 5].map((v) => (
            <g key={`grid-${v}`}>
              <line
                x1={toX(v)} y1={padding} x2={toX(v)} y2={height - padding}
                stroke="#E5E2D9" strokeWidth="1" strokeDasharray={v === 0 ? 'none' : '4,4'}
              />
              <line
                x1={padding} y1={toY(v)} x2={width - padding} y2={toY(v)}
                stroke="#E5E2D9" strokeWidth="1" strokeDasharray={v === 0 ? 'none' : '4,4'}
              />
            </g>
          ))}

          {/* Axis lines */}
          <line
            x1={toX(0)} y1={padding - 8} x2={toX(0)} y2={height - padding + 8}
            stroke="#C4C0B5" strokeWidth="1.5"
          />
          <line
            x1={padding - 8} y1={toY(0)} x2={width - padding + 8} y2={toY(0)}
            stroke="#C4C0B5" strokeWidth="1.5"
          />

          {/* Axis labels */}
          <text x={padding - 4} y={toY(0)} textAnchor="end" dominantBaseline="middle"
            fontSize="11" fill="#8A8780" fontWeight="500">
            {data.osX.lewy}
          </text>
          <text x={width - padding + 4} y={toY(0)} textAnchor="start" dominantBaseline="middle"
            fontSize="11" fill="#8A8780" fontWeight="500">
            {data.osX.prawy}
          </text>
          <text x={toX(0)} y={padding - 14} textAnchor="middle"
            fontSize="11" fill="#8A8780" fontWeight="500">
            {data.osY.gorny}
          </text>
          <text x={toX(0)} y={height - padding + 20} textAnchor="middle"
            fontSize="11" fill="#8A8780" fontWeight="500">
            {data.osY.dolny}
          </text>

          {/* Brand dots */}
          {data.marki.map((marka, i) => {
            const cx = toX(marka.x);
            const cy = toY(marka.y);
            const color = BRAND_COLORS[i % BRAND_COLORS.length];
            const isClient = marka.nazwa.toLowerCase() === clientBrandName.toLowerCase();
            const isHovered = hoveredBrand === marka.nazwa;
            const r = isClient ? 10 : 8;

            return (
              <g
                key={marka.nazwa}
                onMouseEnter={() => setHoveredBrand(marka.nazwa)}
                onMouseLeave={() => setHoveredBrand(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Glow for client brand */}
                {isClient && (
                  <circle cx={cx} cy={cy} r={18} fill={color} opacity={0.12} />
                )}

                {/* Dot */}
                <circle
                  cx={cx} cy={cy} r={isHovered ? r + 2 : r}
                  fill={color}
                  stroke="white" strokeWidth="2.5"
                  style={{ transition: 'r 0.15s ease' }}
                />

                {/* Label */}
                <text
                  x={cx}
                  y={cy - r - 6}
                  textAnchor="middle"
                  fontSize={isClient ? '12' : '11'}
                  fontWeight={isClient ? '600' : '400'}
                  fill={isHovered || isClient ? '#1D1D1B' : '#8A8780'}
                  style={{ transition: 'fill 0.15s ease' }}
                >
                  {marka.nazwa}
                </text>

                {/* Coordinates tooltip on hover */}
                {isHovered && (
                  <text
                    x={cx}
                    y={cy + r + 16}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#8A8780"
                  >
                    ({marka.x}, {marka.y})
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-text-gray text-center mt-3">
        Najedź na punkt, żeby zobaczyć dokładną pozycję marki
      </p>
    </div>
  );
}
