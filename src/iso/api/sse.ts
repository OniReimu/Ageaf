export type JobEvent = {
  event: string;
  data: any;
};

function parseEvent(block: string): JobEvent | null {
  let event = 'message';
  let data = '';

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    }

    if (line.startsWith('data:')) {
      data += line.slice('data:'.length).trim();
    }
  }

  if (!data) return null;

  let parsed: any = data;
  try {
    parsed = JSON.parse(data);
  } catch {
    parsed = data;
  }

  return { event, data: parsed };
}

export async function streamEvents(
  url: string,
  onEvent: (event: JobEvent) => void,
  options?: { signal?: AbortSignal }
) {
  const response = await fetch(url, { signal: options?.signal });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to stream events (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let dividerIndex = buffer.indexOf('\n\n');

    while (dividerIndex >= 0) {
      const chunk = buffer.slice(0, dividerIndex);
      buffer = buffer.slice(dividerIndex + 2);
      const event = parseEvent(chunk);
      if (event) onEvent(event);
      dividerIndex = buffer.indexOf('\n\n');
    }
  }

  const tail = buffer.trim();
  if (tail) {
    const event = parseEvent(tail);
    if (event) onEvent(event);
  }
}
