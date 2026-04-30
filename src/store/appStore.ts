import { create } from 'zustand';
import type { User } from '../types';
import { currentUser, login as authLogin, logout as authLogout } from '../lib/auth/session';

interface AppState {
  user: User | null;
  refresh: () => void;
  login: (email: string, password: string) => boolean;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: currentUser(),
  refresh: () => set({ user: currentUser() }),
  login: (email, password) => {
    const u = authLogin(email, password);
    set({ user: u });
    return !!u;
  },
  logout: () => {
    authLogout();
    set({ user: null });
  },
  setUser: (user) => set({ user }),
}));
