export type SocialEventType = 'visit' | 'gift' | 'chat';

// Pet — one row per pet
export type Pet = {
  id: string;
  owner_id: string;
  name: string;
  soul_md: string;
  skill_md: string;
  wallet_address: string;
  hunger: number;
  mood: number;
  affection: number;
  llm_history: unknown;
  last_tick_at: Date;
};

// Subset of fields needed to create a pet
export type PetCreate = {
  owner_id: string;
  name: string;
  soul_md: string;
  skill_md: string;
};

// Runtime state sent over WebSocket
export type PetState = Pick<Pet, 'hunger' | 'mood' | 'affection'>;

// SocialEvent — one row per pet interaction
export type SocialEvent = {
  id: string;
  from_pet_id: string;
  to_pet_id: string;
  type: SocialEventType;
  payload: unknown;
  created_at: Date;
};

// Transaction — on-chain record
export type Transaction = {
  id: string;
  from_wallet: string;
  to_wallet: string;
  amount: string;
  token: string;
  tx_hash: string;
  x_layer_confirmed: boolean;
  created_at: Date;
};
