/** WebSocket event types — mirrors architecture.md WsEvent schema. */

export interface PetStateData {
  hunger: number;
  mood: number;
  affection: number;
}

export interface PetSpeakData {
  pet_id: string;
  message: string;
}

export interface SocialVisitData {
  from: string;
  to: string;
  dialogue: string[];
}

export interface SocialGiftData {
  from: string;
  to: string;
  tx_hash: string;
}

export interface FriendUnlockedData {
  pet_id: string;
  owner_id: string;
}

export type WsEvent =
  | { type: 'pet.state'; data: PetStateData }
  | { type: 'pet.speak'; data: PetSpeakData }
  | { type: 'social.visit'; data: SocialVisitData }
  | { type: 'social.gift'; data: SocialGiftData }
  | { type: 'friend.unlocked'; data: FriendUnlockedData };
