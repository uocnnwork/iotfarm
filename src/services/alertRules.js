import { SENSOR_LABELS } from '@/config/greenhouse';

const LEVEL_PRIORITY = {
  danger: 3,
  warning: 2,
  info: 1,
};

function toNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isTriggered(operator, value, threshold) {
  if (operator === '>') return value > threshold;
  if (operator === '>=') return value >= threshold;
  if (operator === '<') return value < threshold;
  if (operator === '<=') return value <= threshold;
  if (operator === '==') return value === threshold;
  return false;
}

function getTriggeredThreshold(type, value, thresholds = []) {
  const numericValue = toNumber(value);
  if (numericValue == null || !Array.isArray(thresholds)) return null;

  return thresholds
    .filter((threshold) => (
      threshold?.active !== false &&
      threshold?.sensor_type === type &&
      toNumber(threshold.value) != null &&
      isTriggered(threshold.operator, numericValue, toNumber(threshold.value))
    ))
    .sort((a, b) => (LEVEL_PRIORITY[b.level] || 0) - (LEVEL_PRIORITY[a.level] || 0))[0] || null;
}

function getWarningMessage(threshold) {
  const sensorLabel = SENSOR_LABELS[threshold.sensor_type] || threshold.sensor_type;
  const levelPrefix = threshold.level === 'danger' ? 'Cảnh báo: ' : '';
  const directionLabel = {
    '>': 'cao hơn',
    '>=': 'cao hơn hoặc bằng',
    '<': 'thấp hơn',
    '<=': 'thấp hơn hoặc bằng',
    '==': 'bằng',
  }[threshold.operator] || 'kích hoạt ngưỡng';

  return `${levelPrefix}${sensorLabel} ${directionLabel} ${threshold.value}`;
}

export function getSensorWarning(type, value, thresholds = []) {
  const threshold = getTriggeredThreshold(type, value, thresholds);
  if (!threshold) return null;
  return getWarningMessage(threshold);
}

export function createSensorAlerts(data, thresholds = []) {
  if (!data || !Array.isArray(thresholds)) return [];

  const alerts = [];
  for (const sensorType of Object.keys(SENSOR_LABELS)) {
    const value = data[sensorType];
    const threshold = getTriggeredThreshold(sensorType, value, thresholds);
    if (!threshold) continue;

    alerts.push({
      type: threshold.level,
      level: threshold.level,
      message: getWarningMessage(threshold),
      sensor_type: sensorType,
      value,
      is_read: false,
    });
  }

  return alerts;
}
