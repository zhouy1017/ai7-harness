import type { RendererApi } from '../shared/protocol.js';

declare global {
  interface Window {
    readonly ai7: RendererApi;
  }
}

export {};
