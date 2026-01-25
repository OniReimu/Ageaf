import { LOCAL_STORAGE_KEY_OPTIONS } from "../constants";
import { Options } from "../types";

let lastKnownOptions: Options | null = null;

function applyOptionDefaults(input: Options): Options {
  const options = { ...(input ?? {}) } as Options;

  if (options.transport !== 'http' && options.transport !== 'native') {
    options.transport = 'http';
  }
  if (!options.hostUrl) options.hostUrl = 'http://127.0.0.1:3210';
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
  if (options.enableTools === undefined) options.enableTools = false;
  if (!options.openaiApprovalPolicy) options.openaiApprovalPolicy = 'never';

  return options;
}

export async function getOptions(): Promise<Options> {
  // If the extension context is gone (e.g. after reloading the extension),
  // accessing chrome.storage can throw "Extension context invalidated".
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return applyOptionDefaults(lastKnownOptions ?? {});
  }

  try {
    const data = await chrome.storage.local.get([LOCAL_STORAGE_KEY_OPTIONS]);
    const options = applyOptionDefaults((data[LOCAL_STORAGE_KEY_OPTIONS] ?? {}) as Options);
    lastKnownOptions = options;
    return options;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      return applyOptionDefaults(lastKnownOptions ?? {});
    }
    throw error;
  }
}
