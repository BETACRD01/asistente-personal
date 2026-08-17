import { open } from '@tauri-apps/plugin-dialog';

export async function pickFolder(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false, title: 'Selecciona la carpeta del proyecto' });
  return typeof dir === 'string' && dir ? dir : null;
}