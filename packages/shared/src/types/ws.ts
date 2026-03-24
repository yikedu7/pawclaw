// Discriminated union of all WebSocket events emitted by the server to clients
export type WsEvent =
  | {
      type: 'pet.state';
      data: {
        pet_id: string;
        hunger: number;
        mood: number;
        affection: number;
      };
    }
  | {
      type: 'pet.speak';
      data: {
        pet_id: string;
        message: string;
      };
    }
  | {
      type: 'social.visit';
      data: {
        from_pet_id: string;
        to_pet_id: string;
        turns: Array<{
          speaker_pet_id: string;
          line: string;
        }>;
      };
    }
  | {
      type: 'social.gift';
      data: {
        from_pet_id: string;
        to_pet_id: string;
        token: string;
        amount: string;
        tx_hash: string;
      };
    }
  | {
      type: 'friend.unlocked';
      data: {
        pet_id: string;
        owner_id: string;
        pet_name?: string;
      };
    }
  | {
      type: 'pet.died';
      data: {
        pet_id: string;
      };
    }
  | {
      type: 'pet.revived';
      data: {
        pet_id: string;
      };
    }
  | {
      type: 'error';
      data: {
        pet_id: string;
        message: string;
      };
    };
