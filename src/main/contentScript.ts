'use strict';

import { onReplaceContent } from './eventHandlers';
import { registerEditorBridge } from './editorBridge/bridge';
import { registerInlineDiffOverlay } from './inlineDiffOverlay';

window.addEventListener('copilot:editor:replace', onReplaceContent as EventListener);
registerEditorBridge();
registerInlineDiffOverlay();
