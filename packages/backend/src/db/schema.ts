import {
  pgTable,
  pgSchema,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Supabase built-in auth schema — referenced for FK only, not managed by Drizzle
const authSchema = pgSchema('auth');
const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});

export const pets = pgTable('pets', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_id: uuid('owner_id')
    .notNull()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  soul_md: text('soul_md').notNull(),
  skill_md: text('skill_md').notNull(),
  // Null until Onchain OS creates the wallet asynchronously after container start
  wallet_address: text('wallet_address'),
  hunger: integer('hunger').notNull().default(100),
  mood: integer('mood').notNull().default(100),
  affection: integer('affection').notNull().default(0),
  llm_history: jsonb('llm_history').notNull().default([]),
  last_tick_at: timestamp('last_tick_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  diary_text: text('diary_text'),

  // Economic model: initial PAW grant at registration (for hunger % calc: wallet_balance / initial_credits)
  initial_credits: integer('initial_credits').notNull().default(200),
  // Current PAW balance in PAW units (not Wei) — null until first poll or topup
  paw_balance: numeric('paw_balance'),

  // Container columns — denormalized from port_allocations for O(1) tick loop access
  container_id: text('container_id'),
  container_host: text('container_host'),
  container_port: integer('container_port'),
  container_status: text('container_status').notNull().default('created'),
  gateway_token: text('gateway_token'),
  port_index: integer('port_index'),
}, (t) => [
  index('pets_owner_id_idx').on(t.owner_id),
  check('pets_container_status_check', sql`${t.container_status} IN ('created','starting','running','stopping','stopped','deleted')`),
]);

export const social_events = pgTable('social_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  from_pet_id: uuid('from_pet_id')
    .notNull()
    .references(() => pets.id, { onDelete: 'cascade' }),
  to_pet_id: uuid('to_pet_id').references(() => pets.id, { onDelete: 'set null' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('social_events_from_pet_id_idx').on(t.from_pet_id),
  index('social_events_to_pet_id_idx').on(t.to_pet_id),
  index('social_events_created_at_idx').on(t.created_at),
  check('social_events_type_check', sql`${t.type} IN ('visit','gift','chat')`),
]);

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  from_wallet: text('from_wallet').notNull(),
  to_wallet: text('to_wallet').notNull(),
  // text, not numeric — preserves blockchain precision (Wei strings, 18 decimals)
  amount: text('amount').notNull(),
  token: text('token').notNull(),
  tx_hash: text('tx_hash').notNull(),
  x_layer_confirmed: boolean('x_layer_confirmed').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('transactions_tx_hash_idx').on(t.tx_hash),
  index('transactions_from_wallet_idx').on(t.from_wallet),
  index('transactions_to_wallet_idx').on(t.to_wallet),
]);

export const port_allocations = pgTable('port_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  pet_id: uuid('pet_id')
    .notNull()
    .references(() => pets.id, { onDelete: 'cascade' }),
  port: integer('port').notNull().unique(),
  allocated_at: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
  released_at: timestamp('released_at', { withTimezone: true }),
}, (t) => [
  index('port_allocations_pet_id_idx').on(t.pet_id),
]);
