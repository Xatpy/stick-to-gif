export const INTERNAL_DEBUG_STORAGE_KEY = 'sticktogif:debug';

export function isInternalDebugEnabled() {
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.get('sticktogif_debug') === '1') {
      return true;
    }

    return window.localStorage.getItem(INTERNAL_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}
