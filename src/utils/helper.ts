import { LOCAL_STORAGE_KEY_OPTIONS } from "../constants";
import { Options } from "../types";

let lastKnownOptions: Options | null = null;

// TTL cache for getOptions() — health check runs every 5s, so 10s TTL
// halves the number of chrome.storage.local reads.
let cachedOptions: Options | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10_000;

export function invalidateOptionsCache() {
  cachedOptions = null;
  cacheTimestamp = 0;
}

// Cross-context invalidation (e.g. settings saved in popup while panel is open)
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && LOCAL_STORAGE_KEY_OPTIONS in changes) {
      invalidateOptionsCache();
    }
  });
}

const DEFAULT_TRANSPORT: Options['transport'] = __AGEAF_DEFAULT_TRANSPORT__;

function applyOptionDefaults(input: Options): Options {
  const options = { ...(input ?? {}) } as Options;

  if (options.transport !== 'http' && options.transport !== 'native') {
    options.transport = DEFAULT_TRANSPORT;
  }
  if (options.transport !== 'native' && !options.hostUrl) {
    options.hostUrl = 'http://127.0.0.1:3210';
  }
  if (options.claudeLoadUserSettings === undefined) options.claudeLoadUserSettings = true;
  options.claudeSessionScope = 'project';
  if (options.claudeYoloMode === undefined) options.claudeYoloMode = true;

  if (
    options.openaiApprovalPolicy !== 'untrusted' &&
    options.openaiApprovalPolicy !== 'on-request' &&
    options.openaiApprovalPolicy !== 'on-failure' &&
    options.openaiApprovalPolicy !== 'never'
  ) {
    options.openaiApprovalPolicy = 'never';
  }
  
  if (options.enableCommandBlocklist === undefined) options.enableCommandBlocklist = false;
  if (!options.blockedCommandsUnix) {
    options.blockedCommandsUnix = 'rm -rf\nchmod 777\nchmod -R 777';
  }
  if (!options.openaiApprovalPolicy) options.openaiApprovalPolicy = 'never';
  // Backward-compatible migration:
  // - Previously `debugCliEvents` was used for "Show thinking and tool activity".
  // - Now we split it into:
  //   - `showThinkingAndTools` (client-side display)
  //   - `debugCliEvents` (host/runtime trace events into chat)
  if (options.showThinkingAndTools === undefined) {
    options.showThinkingAndTools = Boolean(options.debugCliEvents ?? false);
    // Do not auto-enable trace events for existing users.
    options.debugCliEvents = false;
  }
  if (options.debugCliEvents === undefined) options.debugCliEvents = false;

  return options;
}

export async function getOptions(): Promise<Options> {
  // Return cached value if within TTL
  const now = Date.now();
  if (cachedOptions && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedOptions;
  }

  // If the extension context is gone (e.g. after reloading the extension),
  // accessing chrome.storage can throw "Extension context invalidated".
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return applyOptionDefaults(lastKnownOptions ?? {});
  }

  try {
    const data = await chrome.storage.local.get([LOCAL_STORAGE_KEY_OPTIONS]);
    const options = applyOptionDefaults((data[LOCAL_STORAGE_KEY_OPTIONS] ?? {}) as Options);
    lastKnownOptions = options;
    cachedOptions = options;
    cacheTimestamp = Date.now();
    return options;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      return applyOptionDefaults(lastKnownOptions ?? {});
    }
    throw error;
  }
}
