'use strict';

export interface EditorContent {
  cmView: {
    view: EditorContentView;
  }
}

export interface EditorContentView {
  state: EditorContentState,
  dispatch: (changes: any) => void;
  coordsAtPos: (pos: number) => DOMRect | null;
  scrollDOM: HTMLElement;
  contentDOM: HTMLElement;
};

export interface EditorContentState {
  doc: {
    lineAt: (pos: number) => {
      number: number;
      from: number;
      text: string;
    };
    line: (number: number) => {
      number: number;
      from: number;
      to: number;
      text: string;
    };
    length: number;
  };
  selection: {
    main: {
      from: number;
      to: number;
      head: number;
    };
  };
  sliceDoc: (from: number, to: number) => string;
};

export interface Options {
  transport?: 'http' | 'native';
  hostUrl?: string;
  claudeModel?: string;
  claudeThinkingMode?: string;
  claudeMaxThinkingTokens?: number | null;
  claudeSessionScope?: 'project' | 'home';
  claudeYoloMode?: boolean;
  openaiApprovalPolicy?: 'untrusted' | 'on-request' | 'on-failure' | 'never';
  piProvider?: string;
  piModel?: string;
  piThinkingLevel?: string;
  displayName?: string;
  customSystemPrompt?: string;
  enableCommandBlocklist?: boolean;
  blockedCommandsUnix?: string;
  showThinkingAndTools?: boolean;
  debugCliEvents?: boolean;
  surroundingContextLimit?: number;
}
export interface StreamChunk {
  kind: "token" | "error",
  content: string
}

export interface TextContent {
  before: string,
  after: string,
  selection: string,
}
