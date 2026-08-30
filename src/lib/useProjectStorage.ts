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

export type ProjectSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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
  const [saveStatus, setSaveStatus] = useState<ProjectSaveStatus>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<{ data: ProjectData; projectId: string | null } | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const projectCreationInFlight = useRef<Promise<string | null> | null>(null);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  const loadProjects = useCallback(async () => {
    if (!userId) return;
    setLoadingProjects(true);
    const { data, error } = await supabase
      .from('user_projects')
      .select('id, name, project_data, updated_at, created_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      const dedupedProjects = mergeLatestProjects(data as unknown as SavedProject[]);
      setSavedProjects(dedupedProjects);
      if (dedupedProjects.length > 0) {
        setCurrentProjectId((current) => current ?? dedupedProjects[0].id);
      }
    }
    setLoadingProjects(false);
  }, [userId]);

  useEffect(() => {
    currentProjectIdRef.current = null;
    projectCreationInFlight.current = null;
    if (userId) {
      setCurrentProjectId(null);
      loadProjects();
    } else {
      setSavedProjects([]);
      setCurrentProjectId(null);
    }
  }, [userId, loadProjects]);

  const saveProject = useCallback(async (data: ProjectData, projectId: string | null) => {
    if (!userId) return null;

    setSaveStatus('saving');

    const name = data.project.name || 'Project Tanpa Nama';
    const payload = data as unknown as Record<string, unknown>;
    let effectiveProjectId = projectId ?? currentProjectIdRef.current;

    // Ketikan berikutnya dapat masuk saat INSERT pertama masih berlangsung.
    // Tunggu hasil INSERT tersebut agar penyimpanan selanjutnya menjadi UPDATE.
    if (!effectiveProjectId && projectCreationInFlight.current) {
      effectiveProjectId = await projectCreationInFlight.current;
    }

    if (effectiveProjectId) {
      const { data: updated, error } = await supabase
        .from('user_projects')
        .update({ project_data: payload, name, updated_at: new Date().toISOString() })
        .eq('id', effectiveProjectId)
        .eq('user_id', userId)
        .select('id, name, project_data, updated_at, created_at')
        .maybeSingle();

      if (!error && updated) {
        const saved = updated as unknown as SavedProject;
        setSavedProjects((previous) => mergeLatestProjects([
          saved,
          ...previous.filter((item) => item.id !== saved.id),
        ]));
        setSaveStatus('saved');
        return updated.id;
      }

      setSaveStatus('error');
      return null;
    }

    const creationPromise = (async () => {
      const { data: inserted, error } = await supabase
        .from('user_projects')
        .insert({ user_id: userId, project_data: payload, name })
        .select('id, name, project_data, updated_at, created_at')
        .maybeSingle();

      if (!error && inserted) {
        const saved = inserted as unknown as SavedProject;
        currentProjectIdRef.current = saved.id;
        setCurrentProjectId(saved.id);
        setSavedProjects((previous) => mergeLatestProjects([saved, ...previous]));
        setSaveStatus('saved');
        return saved.id;
      }

      setSaveStatus('error');
      return null;
    })();

    projectCreationInFlight.current = creationPromise;
    try {
      return await creationPromise;
    } finally {
      if (projectCreationInFlight.current === creationPromise) {
        projectCreationInFlight.current = null;
      }
    }
  }, [userId]);

  const debouncedSave = useCallback((data: ProjectData, projectId: string | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    pendingSave.current = { data, projectId };
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      const pending = pendingSave.current;
      pendingSave.current = null;
      saveTimer.current = null;
      if (pending) await saveProject(pending.data, pending.projectId);
    }, 1000);
  }, [saveProject]);

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const pending = pendingSave.current;
    pendingSave.current = null;
    if (pending) await saveProject(pending.data, pending.projectId);
  }, [saveProject]);

  const deleteProject = useCallback(async (projectId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('user_projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (!error) {
      setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
      if (currentProjectId === projectId) {
        setCurrentProjectId(null);
      }
      return true;
    }
    return false;
  }, [currentProjectId, userId]);

  const selectProject = useCallback((projectId: string) => {
    setCurrentProjectId(projectId);
  }, []);

  const fetchAndRestoreProject = useCallback(
    async (projectId: string) => {
      const { data, error } = await supabase
        .from('user_projects')
        .select('id, name, project_data, updated_at, created_at')
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data) {
        return data as unknown as SavedProject;
      }
      return null;
    },
    [userId],
  );

  const saveRabReport = useCallback(
    async (params: SaveRabParams): Promise<{ success: boolean; error: string | null }> => {
      if (!userId) return { success: false, error: 'User tidak terautentikasi' };

      const reportData = {
        project: params.project,
        floors: params.floors,
      };

      const { error } = await supabase.from('rab_reports').insert({
        user_id: userId,
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
    saveStatus,
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
