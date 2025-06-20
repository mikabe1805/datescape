import { create } from 'zustand';

// matchStore.js
export const useMatchStore = create((set) => ({
  matches: [],
  setMatches: (updater) =>
    set((state) => ({
      matches: typeof updater === 'function' ? updater(state.matches) : updater,
    })),
  clearMatches: () => set({ matches: [] }),
}));
