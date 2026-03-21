import type { PetState } from './pet.js';

// Discriminated union of all WebSocket events emitted by the server to clients
export type WsEvent =
  | { type: 'pet.state'; data: PetState }
  | { type: 'pet.speak'; data: { pet_id: string; message: string } }
  | { type: 'social.visit'; data: { from: string; to: string; dialogue: string[] } }
  | { type: 'social.gift'; data: { from: string; to: string; tx_hash: string } }
  | { type: 'friend.unlocked'; data: { pet_id: string; owner_id: string } };
