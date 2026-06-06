import React from "react";
import { format } from "date-fns";

const SKELETON_ROWS = 8;
const COLUMN_COUNT = 5;

function formatNumber(value) {
  if (value == null || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return Number.isInteger(number) ? number.toString() : number.toFixed(1);
}

function formatRowTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return format(date, "dd/MM/yyyy HH:mm:ss");
}

function getCreatedAt(item) {
  return item?.created_at || item?.created_date || null;
}

export default function HistorySensorTable({ title, rows = [], isLoading }) {
  return (
    <div className="min-w-0">
      {title ? (
        <h3 className="text-sm font-semibold mb-3">{title}</h3>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
              <th className="px-3 py-2.5">Thời gian</th>
              <th className="px-3 py-2.5">Nhiệt độ (°C)</th>
              <th className="px-3 py-2.5">Độ ẩm KK (%)</th>
              <th className="px-3 py-2.5">Độ ẩm đất (%)</th>
              <th className="px-3 py-2.5">Ánh sáng (lux)</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }).map((_, idx) => (
                <tr key={`skeleton-${title}-${idx}`} className="border-b last:border-b-0 animate-pulse">
                  {Array.from({ length: COLUMN_COUNT }).map((__, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-3">
                      <div className="h-3 rounded bg-muted/70" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-3 py-8 text-center text-muted-foreground">
                  Chưa có dữ liệu
                </td>
              </tr>
            ) : (
              rows.map((item) => (
                <tr
                  key={item.id}
                  className="border-b last:border-b-0 transition-colors hover:bg-muted/50"
                >
                  <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                    {formatRowTime(getCreatedAt(item))}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{formatNumber(item.temperature)}</td>
                  <td className="px-3 py-2.5 font-medium">{formatNumber(item.humidity)}</td>
                  <td className="px-3 py-2.5 font-medium">{formatNumber(item.soil_moisture)}</td>
                  <td className="px-3 py-2.5 font-medium">{formatNumber(item.light)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
