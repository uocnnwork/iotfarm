export const SENSOR_LABELS = {
  temperature: 'Nhiệt độ',
  humidity: 'Độ ẩm KK',
  soil_moisture: 'Độ ẩm đất',
  light: 'Ánh sáng',
};

/** Các node luôn hiển thị trên Dashboard (khớp NODE_ID trên từng ESP). */
export const EXPECTED_SENSOR_NODES = ['node1', 'node2'];

export const SENSOR_NODE_LABELS = {
  'node1': 'Khu 1',
  'node2': 'Khu 2',
};

/** Màu đường biểu đồ khi so sánh 2 khu. */
export const SENSOR_NODE_CHART_COLORS = {
  'node1': '#ef4444',
  'node2': '#3b82f6',
};

/** Chế độ xem Dashboard: tất cả node hoặc từng khu. */
export const DASHBOARD_VIEW_ALL = 'all';

/** @deprecated Dùng SENSOR_NODE_LABELS */
export const NODE_LABELS = SENSOR_NODE_LABELS;

export function getNodeLabel(nodeId) {
  return SENSOR_NODE_LABELS[nodeId] ?? nodeId;
}

export function isDashboardSensorNode(nodeId) {
  return Boolean(nodeId && nodeId !== 'default');
}

/** Lọc bản ghi History theo chế độ xem (bỏ qua node default). */
export function filterHistoryForView(rows, viewMode) {
  const list = Array.isArray(rows) ? rows : [];
  if (viewMode === DASHBOARD_VIEW_ALL) {
    return list.filter((row) => EXPECTED_SENSOR_NODES.includes(row?.node_id ?? row?.nodeId));
  }
  return list.filter((row) => (row?.node_id ?? row?.nodeId) === viewMode);
}

export function hasSensorReadingData(reading) {
  return Boolean(
    reading
    && (
      reading.temperature != null
      || reading.humidity != null
      || reading.soil_moisture != null
      || reading.light != null
    ),
  );
}

/**
 * Ghép latest từ API với danh sách node cố định.
 * Bỏ qua node_id = "default" và payload không có node_id.
 */
export function mergeLatestByExpectedNodes(readings = [], expectedNodes = EXPECTED_SENSOR_NODES) {
  const byNode = new Map();

  for (const reading of readings) {
    const nodeId = reading?.node_id ?? reading?.nodeId;
    if (!isDashboardSensorNode(nodeId)) continue;
    byNode.set(nodeId, reading);
  }

  return expectedNodes.map((nodeId) => {
    const fromApi = byNode.get(nodeId);
    return {
      ...(fromApi ?? {}),
      node_id: nodeId,
      nodeId,
      label: getNodeLabel(nodeId),
    };
  });
}

export { DEVICE_IDS, getDeviceLabel } from './devices';
