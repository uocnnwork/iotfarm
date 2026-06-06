export const DEVICE_DEFINITIONS = [
  {
    id: 'pump_1',
    name: 'Bơm Khu 1',
    type: 'pump',
    scope: 'zone',
    node_id: 'node1',
    zoneLabel: 'Khu 1',
  },
  {
    id: 'mist_1',
    name: 'Phun sương Khu 1',
    type: 'mist',
    scope: 'zone',
    node_id: 'node1',
    zoneLabel: 'Khu 1',
  },
  {
    id: 'pump_2',
    name: 'Bơm Khu 2',
    type: 'pump',
    scope: 'zone',
    node_id: 'node2',
    zoneLabel: 'Khu 2',
  },
  {
    id: 'mist_2',
    name: 'Phun sương Khu 2',
    type: 'mist',
    scope: 'zone',
    node_id: 'node2',
    zoneLabel: 'Khu 2',
  },
  {
    id: 'fan',
    name: 'Quạt thông gió',
    type: 'fan',
    scope: 'global',
    node_id: null,
  },
  {
    id: 'led',
    name: 'Đèn LED',
    type: 'light',
    scope: 'global',
    node_id: null,
  },
];

export const DEVICE_IDS = DEVICE_DEFINITIONS.map((device) => device.id);

export const DEVICE_CONTROL_GROUPS = [
  { id: 'zone-1', title: 'Khu 1', deviceIds: ['pump_1', 'mist_1'] },
  { id: 'zone-2', title: 'Khu 2', deviceIds: ['pump_2', 'mist_2'] },
  { id: 'global', title: 'Thiết bị chung', deviceIds: ['fan', 'led'] },
];

const definitionById = new Map(DEVICE_DEFINITIONS.map((device) => [device.id, device]));

export function getDeviceDefinition(deviceId) {
  return definitionById.get(String(deviceId || '').trim()) || null;
}

export function getDeviceLabel(deviceId) {
  return getDeviceDefinition(deviceId)?.name || deviceId;
}

export function getDeviceSubtitle(device) {
  const deviceId = device?.device_id ?? device?.id ?? device?.name;
  const definition = getDeviceDefinition(deviceId);
  if (!definition) return null;
  if (definition.scope === 'global') {
    return 'Thiết bị chung toàn nhà kính';
  }
  return `${definition.zoneLabel} · ${definition.node_id}`;
}

export function getDevicesForDashboardView(devices, selectedNodeView) {
  const list = Array.isArray(devices) ? devices : [];
  if (selectedNodeView === 'all') return list;

  return list.filter((device) => {
    if (device.scope === 'global') return true;
    const nodeId = device.node_id ?? device.nodeId;
    if (nodeId) return nodeId === selectedNodeView;
    const definition = getDeviceDefinition(device.device_id ?? device.name ?? device.id);
    if (definition?.scope === 'global') return true;
    return definition?.node_id === selectedNodeView;
  });
}

export function getDashboardDeviceGroups(selectedNodeView) {
  if (selectedNodeView === 'all') {
    return [
      { title: 'Thiết bị Khu 1', deviceIds: ['pump_1', 'mist_1'] },
      { title: 'Thiết bị Khu 2', deviceIds: ['pump_2', 'mist_2'] },
      { title: 'Thiết bị chung', deviceIds: ['fan', 'led'] },
    ];
  }

  const zoneTitle = selectedNodeView === 'node1' ? 'Thiết bị Khu 1' : 'Thiết bị Khu 2';
  const zoneDeviceIds = selectedNodeView === 'node1'
    ? ['pump_1', 'mist_1']
    : ['pump_2', 'mist_2'];

  return [
    { title: zoneTitle, deviceIds: zoneDeviceIds },
    { title: 'Thiết bị chung', deviceIds: ['fan', 'led'] },
  ];
}
