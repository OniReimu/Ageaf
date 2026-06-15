export type ContextIntent =
  | 'edit_local'
  | 'explain_local'
  | 'meta_followup'
  | 'codebase_query'
  | 'file_wide';

export type SurroundingMode = 'none' | 'narrow' | 'wide';

export interface DetectContextIntentInput {
  action?: string | null;
  message?: string | null;
  hasSelection?: boolean;
}

export interface ComputeContextPolicyInput {
  intent: ContextIntent;
  hasSelection?: boolean;
  surroundingContextLimit?: number | null;
  sessionUsageRatio?: number | null;
}

export interface ContextPolicyDecision {
  intent: ContextIntent;
  attachSelection: boolean;
  surroundingMode: SurroundingMode;
  surroundingBudgetChars: number;
  preferRetrieval: boolean;
  reason: string[];
}

export interface SelectionContextInput {
  selection?: string | null;
  before?: string | null;
  after?: string | null;
}

export interface BuildContextPayloadInput {
  message: string;
  selection?: SelectionContextInput | null;
  policy: ContextPolicyDecision;
}

export interface BuiltContextPayload {
  message: string;
  selection: string;
  surroundingBefore: string;
  surroundingAfter: string;
  contextPolicy: {
    intent: ContextIntent;
    usedSelection: boolean;
    usedSurrounding: boolean;
    preferRetrieval: boolean;
  };
}

const META_FOLLOWUP_RE =
  /\b(above|earlier|previous|prior|last reply|last response|just now)\b|刚才|上一个回复|你刚写的|刚刚/i;
const CODEBASE_QUERY_RE =
  /\b(where is|where's|find|defined|definition|macro|notation|which file|search project|grep)\b|定义|在哪|哪个文件|宏|符号/i;
const FILE_WIDE_RE =
  /\b(whole file|entire file|full file|whole document|entire section|full document)\b|全文|整篇|整个文件/i;
const EXPLAIN_LOCAL_RE =
  /\b(explain this|review this|review this paragraph|how is this written|comment on this|evaluate this)\b|评价下|评价一下|这段写得/i;
const EDIT_LOCAL_RE =
  /\b(rewrite|rephrase|paraphrase|proofread|refine|improve|edit)\b|改写|润色|重写|proofread/i;

function normalizeMessage(message?: string | null) {
  return String(message ?? '').trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shrinkBudgetForUsage(baseBudget: number, sessionUsageRatio: number) {
  if (sessionUsageRatio > 0.8) return 0;
  if (sessionUsageRatio > 0.6) return Math.max(120, Math.floor(baseBudget / 4));
  if (sessionUsageRatio > 0.3) return Math.max(200, Math.floor(baseBudget / 2));
  return baseBudget;
}

function takeTail(value: string, count: number) {
  if (count <= 0) return '';
  if (value.length <= count) return value;
  return value.slice(-count);
}

function takeHead(value: string, count: number) {
  if (count <= 0) return '';
  if (value.length <= count) return value;
  return value.slice(0, count);
}

export function detectContextIntent(
  input: DetectContextIntentInput
): ContextIntent {
  const action = String(input.action ?? '').trim().toLowerCase();
  const message = normalizeMessage(input.message);
  const hasSelection = Boolean(input.hasSelection);

  if (action === 'rewrite') return 'edit_local';
  if (FILE_WIDE_RE.test(message)) return 'file_wide';
  if (META_FOLLOWUP_RE.test(message)) return 'meta_followup';
  if (CODEBASE_QUERY_RE.test(message)) return 'codebase_query';
  if (hasSelection && EDIT_LOCAL_RE.test(message)) return 'edit_local';
  if (hasSelection && EXPLAIN_LOCAL_RE.test(message)) return 'explain_local';
  if (hasSelection) return 'explain_local';
  return 'codebase_query';
}

export function computeContextPolicy(
  input: ComputeContextPolicyInput
): ContextPolicyDecision {
  const hasSelection = Boolean(input.hasSelection);
  const rawLimit = Number.isFinite(input.surroundingContextLimit)
    ? Number(input.surroundingContextLimit)
    : 0;
  const surroundingLimit = Math.max(0, rawLimit);
  const sessionUsageRatio = clamp(
    Number.isFinite(input.sessionUsageRatio) ? Number(input.sessionUsageRatio) : 0,
    0,
    1
  );
  const baseNarrowBudget = Math.min(surroundingLimit || 800, 800);

  switch (input.intent) {
    case 'edit_local': {
      const budget = hasSelection
        ? shrinkBudgetForUsage(baseNarrowBudget || 800, sessionUsageRatio)
        : 0;
      return {
        intent: input.intent,
        attachSelection: hasSelection,
        surroundingMode: hasSelection && budget > 0 ? 'narrow' : 'none',
        surroundingBudgetChars: hasSelection ? budget : 0,
        preferRetrieval: false,
        reason: ['local-edit'],
      };
    }
    case 'explain_local':
      return {
        intent: input.intent,
        attachSelection: hasSelection,
        surroundingMode: 'none',
        surroundingBudgetChars: 0,
        preferRetrieval: false,
        reason: ['selection-only'],
      };
    case 'meta_followup':
      return {
        intent: input.intent,
        attachSelection: false,
        surroundingMode: 'none',
        surroundingBudgetChars: 0,
        preferRetrieval: false,
        reason: ['session-history-only'],
      };
    case 'file_wide':
      return {
        intent: input.intent,
        attachSelection: false,
        surroundingMode: 'none',
        surroundingBudgetChars: 0,
        preferRetrieval: true,
        reason: ['file-wide'],
      };
    case 'codebase_query':
    default:
      return {
        intent: input.intent,
        attachSelection: false,
        surroundingMode: 'none',
        surroundingBudgetChars: 0,
        preferRetrieval: true,
        reason: ['retrieval-first'],
      };
  }
}

export function buildContextPayload(
  input: BuildContextPayloadInput
): BuiltContextPayload {
  const selectionText =
    input.policy.attachSelection && typeof input.selection?.selection === 'string'
      ? input.selection.selection
      : '';
  const useSurrounding =
    input.policy.attachSelection &&
    input.policy.surroundingMode !== 'none' &&
    input.policy.surroundingBudgetChars > 0;
  const halfBudget = Math.floor(input.policy.surroundingBudgetChars / 2);
  const surroundingBefore = useSurrounding
    ? takeTail(String(input.selection?.before ?? ''), halfBudget)
    : '';
  const surroundingAfter = useSurrounding
    ? takeHead(
        String(input.selection?.after ?? ''),
        input.policy.surroundingBudgetChars - halfBudget
      )
    : '';

  return {
    message: input.message,
    selection: selectionText,
    surroundingBefore,
    surroundingAfter,
    contextPolicy: {
      intent: input.policy.intent,
      usedSelection: selectionText.length > 0,
      usedSurrounding:
        surroundingBefore.length > 0 || surroundingAfter.length > 0,
      preferRetrieval: input.policy.preferRetrieval,
    },
  };
}
