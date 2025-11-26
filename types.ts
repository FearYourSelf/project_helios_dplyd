
export enum Sender {
  User = 'user',
  Helios = 'helios',
  Duo = 'duo', // Helios and Elara together
  NSD = 'nsd' // Neural Somatic Driver
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  isThinking?: boolean;
}

export enum AppMode {
  Chat = 'chat',
  Sleep = 'sleep',
  Meditation = 'meditation'
}

export enum ModelType {
  Fast = 'fast',      // gemini-2.5-flash-lite
  Deep = 'deep'       // gemini-3-pro-preview (Thinking)
}
