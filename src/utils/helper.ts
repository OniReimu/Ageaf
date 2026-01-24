import { LOCAL_STORAGE_KEY_OPTIONS } from "../constants";
import { Options } from "../types";

export async function getOptions() {
  const data = await chrome.storage.local.get([LOCAL_STORAGE_KEY_OPTIONS]);
  const options = (data[LOCAL_STORAGE_KEY_OPTIONS] ?? {}) as Options;

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
