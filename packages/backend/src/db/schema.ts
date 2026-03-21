import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
} from 'drizzle-orm/pg-core';

export const pets = pgTable('pets', {
  id: uuid('id').primaryKey().defaultRandom(),
  owner_id: uuid('owner_id').notNull(),
  name: text('name').notNull(),
  soul_md: text('soul_md').notNull(),
  skill_md: text('skill_md').notNull(),
  wallet_address: text('wallet_address').notNull().default(''),
  hunger: integer('hunger').notNull().default(100),
  mood: integer('mood').notNull().default(100),
  affection: integer('affection').notNull().default(0),
  llm_history: jsonb('llm_history').notNull().default([]),
  last_tick_at: timestamp('last_tick_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

  // Container columns
  container_id: text('container_id'),
  container_host: text('container_host'),
  container_port: integer('container_port'),
  container_status: text('container_status').notNull().default('pending'),
  gateway_token: text('gateway_token'),
  port_index: integer('port_index'),
});

export const social_events = pgTable('social_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  from_pet_id: uuid('from_pet_id')
    .notNull()
    .references(() => pets.id),
  to_pet_id: uuid('to_pet_id').references(() => pets.id),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  from_wallet: text('from_wallet').notNull(),
  to_wallet: text('to_wallet').notNull(),
  amount: numeric('amount').notNull(),
  token: text('token').notNull(),
  tx_hash: text('tx_hash').notNull(),
  x_layer_confirmed: boolean('x_layer_confirmed').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const port_allocations = pgTable('port_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  pet_id: uuid('pet_id')
    .notNull()
    .references(() => pets.id),
  port: integer('port').notNull().unique(),
  allocated_at: timestamp('allocated_at', { withTimezone: true }).notNull().defaultNow(),
});
