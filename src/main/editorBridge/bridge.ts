import { getContentAfterCursor, getContentBeforeCursor, getCmView } from '../helpers';
import { onReplaceContent } from '../eventHandlers';
import { MAX_LENGTH_AFTER_CURSOR, MAX_LENGTH_BEFORE_CURSOR } from '../../constants';

const REQUEST_EVENT = 'ageaf:editor:request';
const RESPONSE_EVENT = 'ageaf:editor:response';
const REPLACE_EVENT = 'ageaf:editor:replace';
const INSERT_EVENT = 'ageaf:editor:insert';

interface SelectionRequest {
  requestId: string;
}

interface SelectionResponse {
  requestId: string;
  selection: string;
  before: string;
  after: string;
  from: number;
  to: number;
  head: number;
}

interface ApplyPatchRequest {
  text: string;
}

function onSelectionRequest(event: Event) {
  const detail = (event as CustomEvent<SelectionRequest>).detail;
  if (!detail?.requestId) return;

  const view = getCmView();
  const state = view.state;
  const { from, to, head } = state.selection.main;

  const response: SelectionResponse = {
    requestId: detail.requestId,
    selection: state.sliceDoc(from, to),
    before: getContentBeforeCursor(state, from, MAX_LENGTH_BEFORE_CURSOR),
    after: getContentAfterCursor(state, to, MAX_LENGTH_AFTER_CURSOR),
    from,
    to,
    head,
  };

  window.dispatchEvent(new CustomEvent(RESPONSE_EVENT, { detail: response }));
}

function onReplaceSelection(event: Event) {
  const detail = (event as CustomEvent<ApplyPatchRequest>).detail;
  if (!detail?.text) return;

  const view = getCmView();
  const { from, to } = view.state.selection.main;

  onReplaceContent(
    new CustomEvent('copilot:editor:replace', {
      detail: { content: detail.text, from, to }
    })
  );
}

function onInsertAtCursor(event: Event) {
  const detail = (event as CustomEvent<ApplyPatchRequest>).detail;
  if (!detail?.text) return;

  const view = getCmView();
  const { head } = view.state.selection.main;
  const selection = { anchor: head + detail.text.length };

  view.dispatch({
    changes: { from: head, to: head, insert: detail.text },
    selection,
  });
}

export function registerEditorBridge() {
  window.addEventListener(REQUEST_EVENT, onSelectionRequest as EventListener);
  window.addEventListener(REPLACE_EVENT, onReplaceSelection as EventListener);
  window.addEventListener(INSERT_EVENT, onInsertAtCursor as EventListener);
}
