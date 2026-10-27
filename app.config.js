const fs = require('fs');
const path = require('path');

/**
 * The app's version, YYYY.MM.<build>. The release workflow numbers each release within its month
 * and writes it to version.json just before building; any other build - Expo Go, a development
 * build, one run by hand - is this month's build 0. Everything else is in app.json.
 */
const releaseVersion = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version;
  } catch {
    return undefined;
  }
};

module.exports = ({ config }) => {
  const now = new Date();
  const version =
    releaseVersion() || `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.0`;
  return { ...config, version };
};
