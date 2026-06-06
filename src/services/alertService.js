import { appClient } from '@/api/appClient';

export const alertService = {
  listAll() {
    return appClient.entities.Alert.list();
  },
  listRecent(limit) {
    return appClient.entities.Alert.list('-created_date', limit);
  },
  create(data) {
    return appClient.entities.Alert.create(data);
  },
  markRead(id) {
    return appClient.entities.Alert.update(id, { is_read: true });
  },
  delete(id) {
    return appClient.entities.Alert.delete(id);
  },
  markAllRead() {
    return appClient.alerts.markAllRead();
  },
};
