import { useCallback, useState } from 'react';
import {
  addProject as apiAddProject,
  getProjects as apiGetProjects,
  removeProject as apiRemoveProject,
  setProject as apiSetProject,
} from '../api';
import { pickFolder } from '../lib/folders';

export function useProjects() {
  const [projects, setProjects] = useState<string[]>([]);
  const [project, setProject] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const st = await apiGetProjects();
      setProjects(st.projects ?? []);
      setProject(st.active || null);
    } catch {
      /* daemon sin proyectos */
    }
  }, []);

  const openFolderPicker = useCallback(async () => {
    const dir = await pickFolder();
    if (dir) {
      await apiAddProject(dir);
      await loadProjects();
    }
  }, [loadProjects]);

  const selectProject = useCallback(async (p: string) => {
    setProject(p);
    await apiSetProject(p).catch(() => undefined);
  }, []);

  const removeProject = useCallback(
    async (p: string) => {
      await apiRemoveProject(p).catch(() => undefined);
      await loadProjects();
    },
    [loadProjects]
  );

  return { projects, project, loadProjects, openFolderPicker, selectProject, removeProject };
}