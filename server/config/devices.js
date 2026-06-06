export const DEVICE_DEFINITIONS = [
  {
    id: "pump_1",
    name: "Bơm Khu 1",
    type: "pump",
    scope: "zone",
    node_id: "node1",
    zoneLabel: "Khu 1",
  },
  {
    id: "mist_1",
    name: "Phun sương Khu 1",
    type: "mist",
    scope: "zone",
    node_id: "node1",
    zoneLabel: "Khu 1",
  },
  {
    id: "pump_2",
    name: "Bơm Khu 2",
    type: "pump",
    scope: "zone",
    node_id: "node2",
    zoneLabel: "Khu 2",
  },
  {
    id: "mist_2",
    name: "Phun sương Khu 2",
    type: "mist",
    scope: "zone",
    node_id: "node2",
    zoneLabel: "Khu 2",
  },
  {
    id: "fan",
    name: "Quạt thông gió",
    type: "fan",
    scope: "global",
    node_id: null,
  },
  {
    id: "led",
    name: "Đèn LED",
    type: "light",
    scope: "global",
    node_id: null,
  },
];

export const DEVICE_IDS = DEVICE_DEFINITIONS.map((device) => device.id);

export const LEGACY_DEVICE_IDS = ["pump", "light", "mist"];

const definitionById = new Map(DEVICE_DEFINITIONS.map((device) => [device.id, device]));

export function getDeviceDefinition(deviceId) {
  return definitionById.get(String(deviceId || "").trim()) || null;
}

export function isKnownDeviceId(deviceId) {
  return Boolean(getDeviceDefinition(deviceId));
}

export function getDeviceLabel(deviceId) {
  return getDeviceDefinition(deviceId)?.name || deviceId;
}

export function validateDeviceCommand(deviceId, payload = {}) {
  const definition = getDeviceDefinition(deviceId);
  if (!definition) {
    return { valid: false, message: `Thiết bị "${deviceId}" không được hỗ trợ` };
  }

  if (definition.scope === "zone") {
    const payloadNodeId = payload.node_id ?? payload.nodeId;
    if (payloadNodeId && payloadNodeId !== definition.node_id) {
      return {
        valid: false,
        message: `${definition.name} phải dùng node_id = ${definition.node_id}`,
      };
    }
    if (payload.scope && payload.scope !== "zone") {
      return { valid: false, message: `${definition.name} phải có scope = zone` };
    }
    return { valid: true, definition };
  }

  if (payload.node_id || payload.nodeId) {
    return { valid: false, message: `${definition.name} là thiết bị chung, không dùng node_id` };
  }
  if (payload.scope && payload.scope !== "global") {
    return { valid: false, message: `${definition.name} phải có scope = global` };
  }

  return { valid: true, definition };
}

export function toDeviceMqttPayload({ deviceId, isOn, source = "manual" }) {
  const validation = validateDeviceCommand(deviceId);
  if (!validation.valid) {
    const error = new Error(validation.message);
    error.status = 400;
    throw error;
  }

  const { definition } = validation;
  const payload = {
    device: deviceId,
    is_on: isOn,
    action: isOn ? "on" : "off",
    source,
    scope: definition.scope,
  };

  if (definition.scope === "zone") {
    payload.node_id = definition.node_id;
  }

  return payload;
}

export function mergeDeviceWithDefinition(dbRow, definition) {
  return {
    id: dbRow?.id ?? null,
    name: definition.id,
    type: dbRow?.type ?? definition.type,
    scope: dbRow?.scope ?? definition.scope,
    node_id: dbRow?.node_id ?? definition.node_id ?? null,
    is_on: dbRow?.is_on ?? false,
    mode: dbRow?.mode ?? "manual",
    online: dbRow?.online ?? false,
    last_seen_at: dbRow?.last_seen_at ?? null,
    created_at: dbRow?.created_at ?? null,
    updated_at: dbRow?.updated_at ?? null,
    label: definition.name,
    zoneLabel: definition.zoneLabel ?? null,
  };
}

export function mergeDevicesWithDefinitions(dbRows = []) {
  const byName = new Map(
    (dbRows || [])
      .filter((row) => !LEGACY_DEVICE_IDS.includes(row.name))
      .map((row) => [row.name, row]),
  );

  return DEVICE_DEFINITIONS.map((definition) =>
    mergeDeviceWithDefinition(byName.get(definition.id), definition),
  );
}

export function getDevicesForDashboardView(devices, selectedNodeView) {
  const list = Array.isArray(devices) ? devices : [];
  if (selectedNodeView === "all") return list;

  return list.filter((device) => {
    if (device.scope === "global") return true;
    const nodeId = device.node_id ?? device.nodeId;
    if (nodeId) return nodeId === selectedNodeView;
    const definition = getDeviceDefinition(device.device_id ?? device.name ?? device.id);
    if (definition?.scope === "global") return true;
    return definition?.node_id === selectedNodeView;
  });
}

export const DEVICE_CONTROL_GROUPS = [
  { id: "zone-1", title: "Khu 1", deviceIds: ["pump_1", "mist_1"] },
  { id: "zone-2", title: "Khu 2", deviceIds: ["pump_2", "mist_2"] },
  { id: "global", title: "Thiết bị chung", deviceIds: ["fan", "led"] },
];

export const DASHBOARD_DEVICE_GROUPS = [
  { title: "Thiết bị Khu 1", nodeId: "node1", deviceIds: ["pump_1", "mist_1"] },
  { title: "Thiết bị Khu 2", nodeId: "node2", deviceIds: ["pump_2", "mist_2"] },
  { title: "Thiết bị chung", deviceIds: ["fan", "led"] },
];

export function getDashboardDeviceGroups(selectedNodeView) {
  if (selectedNodeView === "all") {
    return DASHBOARD_DEVICE_GROUPS;
  }

  const zoneGroup = DASHBOARD_DEVICE_GROUPS.find((group) => group.nodeId === selectedNodeView);
  const globalGroup = DASHBOARD_DEVICE_GROUPS.find((group) => !group.nodeId);
  return [zoneGroup, globalGroup].filter(Boolean);
}
