'use strict';

import { onReplaceContent } from './eventHandlers';
import { registerEditorBridge } from './editorBridge/bridge';
import { registerInlineDiffOverlay } from './inlineDiffOverlay';
import { registerCitationIndicator } from './citationIndicator';
import { registerCitationKeyPopup } from './citationKeyPopup';

window.addEventListener('copilot:editor:replace', onReplaceContent as EventListener);
registerEditorBridge();
registerInlineDiffOverlay();
registerCitationIndicator();
registerCitationKeyPopup();
