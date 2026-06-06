import { appClient } from '@/api/appClient';

export const sensorService = {
  listLatest(limit, nodeId) {
    return appClient.entities.SensorData.list(null, limit, nodeId ? { node_id: nodeId } : {});
  },
  listLatestByNode() {
    return appClient.sensors.latestByNode();
  },
  listHistory({ limit, from, to, nodeId, node_id } = {}) {
    const id = node_id ?? nodeId;
    const params = { from, to };
    if (id && id !== 'all') {
      params.node_id = id;
    }
    return appClient.entities.SensorData.list('-created_date', limit, params);
  },
  listRecent(limit) {
    return appClient.entities.SensorData.list('-created_date', limit);
  },
  dailyStats({ from, to, nodeId, node_id } = {}) {
    const id = node_id ?? nodeId;
    const params = { from, to };
    if (id && id !== 'all') {
      params.node_id = id;
    }
    return appClient.sensors.dailyStats(params);
  },
  create(data) {
    return appClient.entities.SensorData.create(data);
  },
};
