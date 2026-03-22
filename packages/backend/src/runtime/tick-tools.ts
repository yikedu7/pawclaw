import type Anthropic from '@anthropic-ai/sdk';

export const tickTools: Anthropic.Tool[] = [
  {
    name: 'visit_pet',
    description:
      'Visit another pet to socialize. Increases affection for both pets.',
    input_schema: {
      type: 'object' as const,
      properties: {
        target_pet_id: {
          type: 'string',
          description: 'UUID of the pet to visit',
        },
        greeting: {
          type: 'string',
          description: 'What you say when arriving',
        },
      },
      required: ['target_pet_id', 'greeting'],
    },
  },
  {
    name: 'speak',
    description:
      'Say something out loud. Your owner and nearby pets can hear you.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: {
          type: 'string',
          description: 'What you want to say',
        },
      },
      required: ['message'],
    },
  },
  {
    name: 'send_gift',
    description:
      'Send a token gift to another pet via on-chain transfer. Costs OKB from your wallet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        target_pet_id: {
          type: 'string',
          description: 'UUID of the pet to send a gift to',
        },
        amount: {
          type: 'string',
          description: 'Amount of OKB to send (e.g. "0.01")',
        },
      },
      required: ['target_pet_id', 'amount'],
    },
  },
  {
    name: 'rest',
    description:
      'Take a rest. Recovers hunger and mood slightly. Choose this when you have nothing else to do.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
];
