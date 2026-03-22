export type SocialEventType = 'visit' | 'gift' | 'chat';

// User account
export type User = {
  id: string;
  email: string;
};

// Pet — one row per pet (DB record)
export type Pet = {
  id: string;
  owner_id: string;
  name: string;
  soul_md: string;
  skill_md: string;
  wallet_address: string | null;
  hunger: number;
  mood: number;
  affection: number;
  llm_history: unknown;
  last_tick_at: Date | null;
};

// Fields needed to create a pet (API input)
export type PetCreate = {
  soul_prompt: string; // short personality description, e.g. "an anxious terrier who loves books"
  name: string;
};

// Pet state as returned by the REST API
export type PetState = {
  id: string;
  owner_id: string;
  name: string;
  wallet_address: string;
  hunger: number;
  mood: number;
  affection: number;
};

// SocialEvent payload — type-specific fields, all optional
export type SocialEventPayload = {
  // visit: multi-round LLM dialogue
  turns?: Array<{
    speaker_pet_id: string;
    line: string;
  }>;
  // gift: on-chain transfer details
  token?: string;
  amount?: string;
  tx_hash?: string;
  // speak: solo utterance
  message?: string;
  // rest: payload is empty
};

// SocialEvent — one row per pet interaction
export type SocialEvent = {
  id: string;
  type: SocialEventType;
  pet_ids: string[];        // uuids of all pets involved; first entry is the initiating pet
  payload: SocialEventPayload;
  created_at: string;       // ISO 8601
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
