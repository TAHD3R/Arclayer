export interface FavoritesState {
  paths: string[];
  toggle: (path: string) => void;
}
