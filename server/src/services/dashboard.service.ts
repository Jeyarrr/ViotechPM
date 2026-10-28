// Real Phase 1 contract: no project/task records exist. Never seed fabricated metrics.
export function overviewData() {
  return {
    phase: 1,
    currency: 'PHP',
    metrics: {
      totalProjects: 0,
      activeProjects: 0,
      pendingTasks: 0,
      completedProjects: 0,
      totalBudget: 0,
    },
    projectStatus: [],
    budgetSeries: [],
    recentActivity: [],
    deadlines: [],
    teamWorkload: [],
  };
}
