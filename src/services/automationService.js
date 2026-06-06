import { appClient } from '@/api/appClient';

export const automationService = {
  listRules() {
    return appClient.entities.AutomationRule.list();
  },
  createRule(data) {
    return appClient.entities.AutomationRule.create(data);
  },
  updateRule(id, patch) {
    return appClient.entities.AutomationRule.update(id, patch);
  },
  deleteRule(id) {
    return appClient.entities.AutomationRule.delete(id);
  },
};
