// ============================================================
// K6 LOAD STAGES CONFIGURATION
// ============================================================
// Pre-defined load patterns for different test scenarios

export const loadTestStages = [
  { duration: '2m', target: 10, name: 'warmup' },
  { duration: '3m', target: 50, name: 'ramp_up' },
  { duration: '5m', target: 100, name: 'peak_load' },
  { duration: '2m', target: 150, name: 'stress' },
  { duration: '2m', target: 50, name: 'recovery' },
  { duration: '1m', target: 0, name: 'ramp_down' },
];

export const stressTestStages = [
  { duration: '1m', target: 50, name: 'ramp_up' },
  { duration: '10m', target: 200, name: 'stress' },
  { duration: '1m', target: 0, name: 'ramp_down' },
];

export const spikeTestStages = [
  { duration: '2m', target: 50, name: 'baseline' },
  { duration: '30s', target: 300, name: 'spike' },
  { duration: '2m', target: 50, name: 'recovery' },
  { duration: '30s', target: 300, name: 'spike_2' },
  { duration: '2m', target: 0, name: 'ramp_down' },
];

export const soakTestStages = [
  { duration: '5m', target: 100, name: 'ramp_up' },
  { duration: '60m', target: 100, name: 'soak' },
  { duration: '5m', target: 0, name: 'ramp_down' },
];

export const quickTestStages = [
  { duration: '30s', target: 20, name: 'ramp_up' },
  { duration: '2m', target: 50, name: 'peak' },
  { duration: '30s', target: 0, name: 'ramp_down' },
];

export const strategyComparisonStages = [
  { duration: '1m', target: 30, name: 'warmup' },
  { duration: '5m', target: 50, name: 'steady' },
  { duration: '1m', target: 0, name: 'ramp_down' },
];
