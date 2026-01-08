/**
 * Profile merge helper: resolves conflicts between local and cloud profiles.
 * Rules:
 * 1) Numbers: higher wins.
 * 2) Booleans: true wins.
 * 3) Strings: if path ends with "lastResult", prefer win > loss > other; otherwise, if both non-empty and different, prefer cloud.
 * 4) updatedAt: most recent timestamp wins.
 * 5) Objects: deep merge by key using these rules.
 * 6) Arrays: longer wins; tie prefers cloud.
 * 7) Missing/null: take the other side.
 *
 * Returns merged profile plus a decisions log for debugging.
 */

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value?.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  if (value.seconds != null) {
    const millis =
      value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6);
    return new Date(millis);
  }
  return null;
}

function rankLastResult(value) {
  const normalized = (value || '').toString().toLowerCase();
  if (normalized === 'win') return 3;
  if (normalized === 'loss' || normalized === 'fail') return 2;
  if (normalized === 'skip') return 1;
  return 0;
}

function mergeValue(path, localVal, cloudVal, decisions) {
  const pathLabel = path.join('.') || '(root)';

  if (localVal == null && cloudVal == null) {
    return null;
  }
  if (localVal == null) {
    decisions.push({ path: pathLabel, picked: 'cloud', reason: 'local missing' });
    return cloudVal;
  }
  if (cloudVal == null) {
    decisions.push({ path: pathLabel, picked: 'local', reason: 'cloud missing' });
    return localVal;
  }

  // Numbers: higher wins.
  if (typeof localVal === 'number' && typeof cloudVal === 'number') {
    const picked = localVal >= cloudVal ? 'local' : 'cloud';
    const value = picked === 'local' ? localVal : cloudVal;
    decisions.push({
      path: pathLabel,
      picked,
      reason: 'higher number',
      local: localVal,
      cloud: cloudVal,
    });
    return value;
  }

  // Booleans: true wins.
  if (typeof localVal === 'boolean' && typeof cloudVal === 'boolean') {
    const value = localVal || cloudVal;
    decisions.push({
      path: pathLabel,
      picked: value === localVal && value === cloudVal ? 'both' : value === localVal ? 'local' : 'cloud',
      reason: 'boolean OR',
    });
    return value;
  }

  // updatedAt: latest wins.
  if (path[path.length - 1] === 'updatedAt') {
    const localDate = toDate(localVal);
    const cloudDate = toDate(cloudVal);
    const value =
      localDate && cloudDate
        ? localDate >= cloudDate
          ? localVal
          : cloudVal
        : localDate || cloudDate || cloudVal || localVal;
    const picked =
      localDate && cloudDate
        ? localDate >= cloudDate
          ? 'local'
          : 'cloud'
        : localDate
        ? 'local'
        : 'cloud';
    decisions.push({
      path: pathLabel,
      picked,
      reason: 'latest updatedAt',
      local: localVal,
      cloud: cloudVal,
    });
    return value;
  }

  // Strings: lastResult special-case, otherwise prefer cloud if different and both non-empty.
  if (typeof localVal === 'string' && typeof cloudVal === 'string') {
    if (path[path.length - 1] === 'lastResult') {
      const localRank = rankLastResult(localVal);
      const cloudRank = rankLastResult(cloudVal);
      const picked =
        cloudRank > localRank
          ? 'cloud'
          : localRank > cloudRank
          ? 'local'
          : 'cloud';
      const value = picked === 'local' ? localVal : cloudVal;
      decisions.push({
        path: pathLabel,
        picked,
        reason: 'best lastResult',
        local: localVal,
        cloud: cloudVal,
      });
      return value;
    }
    if (localVal && cloudVal && localVal !== cloudVal) {
      decisions.push({
        path: pathLabel,
        picked: 'cloud',
        reason: 'string conflict, cloud preferred',
        local: localVal,
        cloud: cloudVal,
      });
      return cloudVal;
    }
    const value = localVal || cloudVal;
    decisions.push({
      path: pathLabel,
      picked: localVal ? 'local' : 'cloud',
      reason: 'string fallback',
    });
    return value;
  }

  // Arrays: longer wins, tie prefers cloud.
  if (Array.isArray(localVal) || Array.isArray(cloudVal)) {
    if (Array.isArray(localVal) && Array.isArray(cloudVal)) {
      const pickCloud =
        cloudVal.length > localVal.length ||
        (cloudVal.length === localVal.length && cloudVal.length > 0);
      const picked = pickCloud ? 'cloud' : 'local';
      const value = pickCloud ? cloudVal : localVal;
      decisions.push({
        path: pathLabel,
        picked,
        reason: 'array length',
        localLen: localVal.length,
        cloudLen: cloudVal.length,
      });
      return value;
    }
    decisions.push({
      path: pathLabel,
      picked: Array.isArray(localVal) ? 'local' : 'cloud',
      reason: 'array vs non-array',
    });
    return Array.isArray(localVal) ? localVal : cloudVal;
  }

  // Objects: deep merge.
  if (isObject(localVal) && isObject(cloudVal)) {
    const merged = {};
    const keys = new Set([...Object.keys(localVal), ...Object.keys(cloudVal)]);
    keys.forEach((key) => {
      merged[key] = mergeValue([...path, key], localVal[key], cloudVal[key], decisions);
    });
    decisions.push({ path: pathLabel, picked: 'merge', reason: 'object merge' });
    return merged;
  }

  // Fallback: prefer cloud if defined, otherwise local.
  if (cloudVal !== undefined) {
    decisions.push({ path: pathLabel, picked: 'cloud', reason: 'fallback' });
    return cloudVal;
  }
  decisions.push({ path: pathLabel, picked: 'local', reason: 'fallback' });
  return localVal;
}

function mergeProfiles(localProfile = {}, cloudProfile = {}) {
  const decisions = [];
  const merged = mergeValue([], localProfile, cloudProfile, decisions);
  return { mergedProfile: merged || {}, decisions };
}

// Tiny test harness
(() => {
  const sampleLocal = {
    gold: 120,
    updatedAt: '2024-01-01T10:00:00Z',
  };
  const sampleCloud = {
    gold: 150,
    updatedAt: '2024-02-01T10:00:00Z',
  };
  const { mergedProfile, decisions } = mergeProfiles(sampleLocal, sampleCloud);
  // eslint-disable-next-line no-console
  console.log('[profileMerge]', { mergedProfile, decisions });
})();

export { mergeProfiles, mergeValue };
