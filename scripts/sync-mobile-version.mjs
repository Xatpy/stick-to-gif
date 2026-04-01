import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const packageJsonPath = path.join(rootDir, 'package.json');
const androidGradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');
const iosProjectPath = path.join(rootDir, 'ios', 'App', 'StickToGif.xcodeproj', 'project.pbxproj');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function writeIfChanged(filePath, nextContent) {
  const currentContent = readText(filePath);
  if (currentContent !== nextContent) {
    fs.writeFileSync(filePath, nextContent);
  }
}

function parsePackageVersion() {
  const packageJson = JSON.parse(readText(packageJsonPath));
  const version = packageJson.version;

  if (typeof version !== 'string') {
    throw new Error('package.json version is missing or invalid.');
  }

  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`Unsupported package.json version format: ${version}`);
  }

  const [, majorText, minorText, patchText] = match;
  const major = Number.parseInt(majorText, 10);
  const minor = Number.parseInt(minorText, 10);
  const patch = Number.parseInt(patchText, 10);

  return {
    version,
    buildNumber: major * 1_000_000 + minor * 1_000 + patch,
  };
}

function replaceRequired(content, pattern, replacement, label) {
  if (!content.match(pattern)) {
    throw new Error(`Could not update ${label}. Pattern not found.`);
  }

  return content.replace(pattern, replacement);
}

function syncAndroidVersion(versionName, versionCode) {
  let content = readText(androidGradlePath);

  content = replaceRequired(
    content,
    /versionCode\s+\d+/,
    `versionCode ${versionCode}`,
    'Android versionCode',
  );
  content = replaceRequired(
    content,
    /versionName\s+"[^"]+"/,
    `versionName "${versionName}"`,
    'Android versionName',
  );

  writeIfChanged(androidGradlePath, content);
}

function syncIosVersion(marketingVersion, buildNumber) {
  let content = readText(iosProjectPath);

  content = replaceRequired(
    content,
    /CURRENT_PROJECT_VERSION = [^;]+;/g,
    `CURRENT_PROJECT_VERSION = ${buildNumber};`,
    'iOS CURRENT_PROJECT_VERSION',
  );
  content = replaceRequired(
    content,
    /MARKETING_VERSION = [^;]+;/g,
    `MARKETING_VERSION = ${marketingVersion};`,
    'iOS MARKETING_VERSION',
  );

  writeIfChanged(iosProjectPath, content);
}

const { version, buildNumber } = parsePackageVersion();

syncAndroidVersion(version, buildNumber);
syncIosVersion(version, buildNumber);

console.log(`Synced mobile versions to ${version} (build ${buildNumber}).`);
