/**
 * WSI App — Types
 */

export interface SafetyData {
  locality: string;
  safetyIndex: number;           // raw base score
  adjustedSafetyIndex: number;   // score after lux penalty
  category: string;
  distanceKm: number;
  stats: {
    meanSeverity: number;
    medianLighting: number;
    medianCrowd: number;
    nIncidents: number;
  };
  lux: {
    multiplier: number;
    luxUsed: number | null;
    hourUsed: number;
    nighttime: boolean;
    riskLevel: string;
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
  safetyData?: SafetyData;
  confidence?: number;
  bentoData?: {
    vibe: string;
    crowd: string;
    incidents: string;
  };
}

let _counter = 0;

export function createMessage(
  role: ChatMessage['role'],
  text: string,
  safetyData?: SafetyData,
  confidence?: number,
  bentoData?: ChatMessage['bentoData']
): ChatMessage {
  return {
    id: `msg_${Date.now()}_${_counter++}`,
    role,
    text,
    timestamp: new Date(),
    safetyData,
    confidence,
    bentoData,
  };
}
