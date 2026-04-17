// Centralized query key factory. Import everywhere instead of literal arrays
// so invalidation calls stay in sync with the queries they target.
export const qk = {
  health: ['health'] as const,
  metrics: ['metrics'] as const,
  prometheus: ['prometheus'] as const,
  tasks: ['tasks'] as const,
  task: (id: string) => ['tasks', id] as const,
  workers: ['workers'] as const,
  sessions: ['sessions'] as const,
  sessionMessages: (id: string) => ['sessions', id, 'messages'] as const,
  rules: ['rules'] as const,
  facts: ['facts'] as const,
  economy: ['economy'] as const,
  approvals: ['approvals'] as const,
};
