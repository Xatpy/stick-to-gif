import { Capacitor } from '@capacitor/core';

export function getRuntimePlatform() {
  return Capacitor.getPlatform();
}

export function isNativeMobilePlatform() {
  const platform = getRuntimePlatform();
  return Capacitor.isNativePlatform() && (platform === 'ios' || platform === 'android');
}

export function shouldUseMobileUi() {
  if (isNativeMobilePlatform()) {
    return true;
  }

  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function getAppAssetUrl(path: string) {
  const cleanPath = path.replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${cleanPath}`;
}

export function getAbsoluteAppAssetUrl(path: string) {
  const relativeUrl = getAppAssetUrl(path);

  try {
    return new URL(relativeUrl, window.location.href).toString();
  } catch {
    return relativeUrl;
  }
}

export function getAppHomeHref() {
  return import.meta.env.BASE_URL;
}
