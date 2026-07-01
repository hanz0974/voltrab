import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { ProjectState, Floor, StepId } from '../types';

export interface SavedProject {
  id: string;
  name: string;
  project_data: ProjectData;
  updated_at: string;
  created_at: string;
}

export interface ProjectData {
  project: ProjectState;
  floors: Floor[];
  floorCount: number;
  step: StepId;
  completed: StepId[];
}

export interface RabReport {
  id: string;
  project_name: string;
  client: string | null;
  location: string | null;
  project_date: string | null;
  report_data: Record<string, unknown>;
  grand_total: number;
  total_items: number;
  total_qty: number;
  created_at: string;
}

export interface SaveRabParams {
  project: ProjectState;
  floors: Floor[];
  grandTotal: number;
  totalItems: number;
  totalQty: number;
}

function mergeLatestProjects(projects: SavedProject[]): SavedProject[] {
  const latestByName = new Map<string, SavedProject>();

  for (const project of projects) {
    const normalizedName = (project.name || 'Project Tanpa Nama').trim().toLowerCase();
    const existing = latestByName.get(normalizedName);

    if (!existing) {
      latestByName.set(normalizedName, project);
      continue;
    }

    const existingUpdated = new Date(existing.updated_at ?? 0).getTime();
    const incomingUpdated = new Date(project.updated_at ?? 0).getTime();

    if (incomingUpdated > existingUpdated) {
      latestByName.set(normalizedName, project);
      continue;
    }

    if (incomingUpdated === existingUpdated) {
      const existingCreated = new Date(existing.created_at ?? 0).getTime();
      const incomingCreated = new Date(project.created_at ?? 0).getTime();

      if (incomingCreated > existingCreated) {
        latestByName.set(normalizedName, project);
      }
    }
  }

  return Array.from(latestByName.values()).sort((a, b) => {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

export function useProjectStorage(userId: string | undefined) {
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProjects = useCallback(async () => {
    if (!userId) return;
    setLoadingProjects(true);
    const { data, error } = await supabase
      .from('user_projects')
      .select('id, name, project_data, updated_at, created_at')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      const dedupedProjects = mergeLatestProjects(data as unknown as SavedProject[]);
      setSavedProjects(dedupedProjects);
      if (dedupedProjects.length > 0 && !currentProjectId) {
        setCurrentProjectId(dedupedProjects[0].id);
      }
    }
    setLoadingProjects(false);
  }, [userId, currentProjectId]);

  useEffect(() => {
    if (userId) {
      setCurrentProjectId(null);
      loadProjects();
    } else {
      setSavedProjects([]);
      setCurrentProjectId(null);
    }
  }, [userId]);

  const saveProject = useCallback(async (data: ProjectData, projectId: string | null) => {
    if (!userId) return null;

    const name = data.project.name || 'Project Tanpa Nama';
    const payload = data as unknown as Record<string, unknown>;

    if (projectId) {
      const { data: updated, error } = await supabase
        .from('user_projects')
        .update({ project_data: payload, name, updated_at: new Date().toISOString() })
        .eq('id', projectId)
        .select('id')
        .maybeSingle();

      if (!error && updated) return updated.id;
    }

    const { data: inserted, error } = await supabase
      .from('user_projects')
      .insert({ project_data: payload, name })
      .select('id')
      .maybeSingle();

    if (!error && inserted) {
      setCurrentProjectId(inserted.id);
      return inserted.id;
    }

    return projectId;
  }, [userId]);

  const debouncedSave = useCallback((data: ProjectData, projectId: string | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveProject(data, projectId);
    }, 1000);
  }, [saveProject]);

  const flushPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
  }, []);

  const deleteProject = useCallback(async (projectId: string) => {
    const { error } = await supabase
      .from('user_projects')
      .delete()
      .eq('id', projectId);

    if (!error) {
      setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
      }
    }
  }, [currentProjectId]);

  const selectProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
  }, []);

  const fetchAndRestoreProject = useCallback(
    async (projectId: string) => {
      const { data, error } = await supabase
        .from('user_projects')
        .select('id, name, project_data, updated_at, created_at')
        .eq('id', projectId)
        .maybeSingle();

      if (!error && data) {
        return data as unknown as SavedProject;
      }
      return null;
    },
    [],
  );

  const saveRabReport = useCallback(
    async (params: SaveRabParams): Promise<{ success: boolean; error: string | null }> => {
      if (!userId) return { success: false, error: 'User tidak terautentikasi' };

      const reportData = {
        project: params.project,
        floors: params.floors,
      };

      const { error } = await supabase.from('rab_reports').insert({
        project_name: params.project.name || 'Project Tanpa Nama',
        client: params.project.client || null,
        location: params.project.location || null,
        project_date: params.project.date || null,
        report_data: reportData,
        grand_total: params.grandTotal,
        total_items: params.totalItems,
        total_qty: params.totalQty,
      });

      if (error) return { success: false, error: error.message };
      return { success: true, error: null };
    },
    [userId],
  );

  return {
    savedProjects,
    currentProjectId,
    loadingProjects,
    loadProjects,
    saveProject,
    debouncedSave,
    flushPendingSave,
    deleteProject,
    selectProject,
    saveRabReport,
    fetchAndRestoreProject,
  };
}
