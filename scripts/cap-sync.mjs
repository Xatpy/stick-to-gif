import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const rootDir = process.cwd();
const iosDir = path.join(rootDir, 'ios', 'App');
const legacyProjectPath = path.join(iosDir, 'App.xcodeproj');
const actualProjectName = 'StickToGif.xcodeproj';
const actualProjectPath = path.join(iosDir, actualProjectName);

function ensureLegacySymlink() {
  if (!fs.existsSync(actualProjectPath)) {
    throw new Error(`Expected iOS project at ${actualProjectPath}`);
  }

  if (fs.existsSync(legacyProjectPath)) {
    const stat = fs.lstatSync(legacyProjectPath);
    if (!stat.isSymbolicLink()) {
      throw new Error(`${legacyProjectPath} exists and is not a temporary symlink.`);
    }

    const target = fs.readlinkSync(legacyProjectPath);
    if (target !== actualProjectName) {
      throw new Error(`${legacyProjectPath} points to ${target}, expected ${actualProjectName}.`);
    }

    return false;
  }

  fs.symlinkSync(actualProjectName, legacyProjectPath);
  return true;
}

function cleanupLegacySymlink(created) {
  if (!created) {
    return;
  }

  if (fs.existsSync(legacyProjectPath) && fs.lstatSync(legacyProjectPath).isSymbolicLink()) {
    fs.unlinkSync(legacyProjectPath);
  }
}

const createdLegacySymlink = ensureLegacySymlink();

try {
  const result = spawnSync('npx', ['cap', 'sync'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }

  if (result.error) {
    throw result.error;
  }
} finally {
  cleanupLegacySymlink(createdLegacySymlink);
}
