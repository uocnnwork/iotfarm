import { format } from 'date-fns';
import { EXPECTED_SENSOR_NODES, getNodeLabel } from '@/config/greenhouse';

function getReadingTimestamp(row) {
  const raw = row?.created_date ?? row?.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function groupReadingsByNode(rows, nodeIds = EXPECTED_SENSOR_NODES) {
  const map = Object.fromEntries(nodeIds.map((id) => [id, []]));
  for (const row of rows ?? []) {
    const nodeId = row?.node_id ?? row?.nodeId;
    if (map[nodeId]) {
      map[nodeId].push(row);
    }
  }
  return map;
}

/** Gộp lịch sử nhiều node thành điểm chart: { time, [Khu 1]: n, [Khu 2]: n }. */
export function buildCompareChartData(
  historiesByNode,
  dataKey,
  nodeIds = EXPECTED_SENSOR_NODES,
  maxPoints = 20,
) {
  const buckets = new Map();

  for (const nodeId of nodeIds) {
    const rows = historiesByNode[nodeId] ?? [];
    const seriesLabel = getNodeLabel(nodeId);

    for (const row of rows) {
      const date = getReadingTimestamp(row);
      const value = row?.[dataKey];
      if (!date || value == null || !Number.isFinite(Number(value))) continue;

      const sortKey = date.getTime();
      if (!buckets.has(sortKey)) {
        buckets.set(sortKey, {
          sortKey,
          time: format(date, 'HH:mm'),
        });
      }
      buckets.get(sortKey)[seriesLabel] = Number(value);
    }
  }

  return [...buckets.values()]
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(-maxPoints)
    .map(({ sortKey, ...point }) => point);
}

/** So sánh từ một mảng readings (History, chế độ Tất cả). */
export function buildCompareChartDataFromRows(
  rows,
  dataKey,
  nodeIds = EXPECTED_SENSOR_NODES,
  maxPoints = 100,
) {
  return buildCompareChartData(groupReadingsByNode(rows, nodeIds), dataKey, nodeIds, maxPoints);
}

export function buildSingleNodeChartData(rows, dataKey, maxPoints = 100) {
  const sorted = [...(rows ?? [])]
    .filter((row) => row?.[dataKey] != null && Number.isFinite(Number(row[dataKey])))
    .sort((a, b) => {
      const ta = getReadingTimestamp(a)?.getTime() ?? 0;
      const tb = getReadingTimestamp(b)?.getTime() ?? 0;
      return ta - tb;
    })
    .slice(-maxPoints);

  return sorted.map((row) => {
    const date = getReadingTimestamp(row);
    return {
      fullTime: date?.toISOString() ?? null,
      time: date ? format(date, 'HH:mm') : '',
      value: Number(row[dataKey]),
    };
  });
}

export function getCompareSeries(nodeIds = EXPECTED_SENSOR_NODES) {
  return nodeIds.map((nodeId) => ({
    nodeId,
    label: getNodeLabel(nodeId),
  }));
}
