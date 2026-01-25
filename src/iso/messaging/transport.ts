import type { Options } from '../../types';
import { httpTransport } from './httpTransport';
import { nativeTransport } from './nativeTransport';

export type TransportKind = 'http' | 'native';

export function createTransport(options: Options) {
  const kind = options.transport === 'native' ? 'native' : 'http';
  return kind === 'native' ? nativeTransport(options) : httpTransport(options);
}
