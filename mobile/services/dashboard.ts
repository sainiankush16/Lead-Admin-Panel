import { api } from "@/services/api";
import type { Project, ProjectLeadsResponse } from "@/types";
import {
  buildDashboardSummary,
  mapPool,
  type DashboardSummary
} from "@/utils/dashboardSummary";

const PROJECT_FETCH_CONCURRENCY = 4;

export interface DashboardLoadResult {
  summary: DashboardSummary;
  projectLeads: ProjectLeadsResponse[];
}

export async function loadDashboardSummary(): Promise<DashboardLoadResult> {
  const { projects } = await api.getProjects();
  const list: Project[] = Array.isArray(projects) ? projects : [];

  if (!list.length) {
    return {
      summary: buildDashboardSummary([]),
      projectLeads: []
    };
  }

  const projectLeads = await mapPool(
    list,
    PROJECT_FETCH_CONCURRENCY,
    async (project: Project): Promise<ProjectLeadsResponse> => api.getProjectLeads(project.id)
  );

  return {
    summary: buildDashboardSummary(projectLeads),
    projectLeads
  };
}
