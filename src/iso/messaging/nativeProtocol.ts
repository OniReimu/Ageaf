export type NativeHostRequest =
  | {
      id: string;
      kind: 'request';
      request: {
        method: 'GET' | 'POST' | 'DELETE';
        path: string;
        headers?: Record<string, string>;
        body?: unknown;
        stream?: boolean;
      };
    }
  | {
      id: string;
      kind: 'cancel';
    };

export type NativeHostResponse =
  | { id: string; kind: 'response'; status: number; body?: unknown; headers?: Record<string, string> }
  | { id: string; kind: 'event'; event: { event: string; data: unknown } }
  | { id: string; kind: 'end' }
  | { id: string; kind: 'error'; message: string };
