'use strict';

import { onReplaceContent } from './eventHandlers';
import { registerEditorBridge } from './editorBridge/bridge';

window.addEventListener('copilot:editor:replace', onReplaceContent as EventListener);
registerEditorBridge();
