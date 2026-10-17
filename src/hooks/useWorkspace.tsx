import { createContext, useContext } from 'react';
export type ScreenName = 'Overview' | 'Insights' | 'App limits' | 'Settings';
export type Workspace = {
  date: number;
  setDate: (date: number) => void;
  navigate: (screen: ScreenName) => void;
  showFocus: () => void;
  showLimit: (appId?: string) => void;
  showSchedule: () => void;
  showDate: () => void;
  notify: (message: string) => void;
};
export const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace provider is missing.');
  return value;
}
