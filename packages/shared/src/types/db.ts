// DB row types inferred from Drizzle schema.
// These mirror the shape returned by Drizzle queries.

export type ContainerStatus = 'pending' | 'starting' | 'running' | 'stopping' | 'stopped' | 'deleted';

export type SocialEventType = 'visit' | 'gift' | 'chat' | 'speak' | 'rest';

export type DbPet = {
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
  last_tick_at: Date | null;
  created_at: Date;
  // Container
  container_id: string | null;
  container_host: string | null;
  container_port: number | null;
  container_status: ContainerStatus;
  gateway_token: string | null;
  port_index: number | null;
};

export type DbSocialEvent = {
  id: string;
  from_pet_id: string;
  to_pet_id: string | null;
  type: SocialEventType;
  payload: unknown;
  created_at: Date;
};

export type DbTransaction = {
  id: string;
  from_wallet: string;
  to_wallet: string;
  amount: string;
  token: string;
  tx_hash: string;
  x_layer_confirmed: boolean;
  created_at: Date;
};

export type DbPortAllocation = {
  id: string;
  pet_id: string;
  port: number;
  allocated_at: Date;
};
