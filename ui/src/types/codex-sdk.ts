export type CodexSdkEvent =
  | {
      type: 'ready';
      message: string;
      timestamp: string;
    }
  | {
      type: 'user_message';
      id: string;
      text: string;
      timestamp: string;
    }
  | {
      type: 'thinking';
      id: string;
      status: 'started' | 'updated' | 'completed';
      text: string;
      timestamp: string;
    }
  | {
      type: 'log';
      level: 'info' | 'warn' | 'error';
      message: string;
      timestamp: string;
    }
  | {
      type: 'agent_response';
      id: string;
      text: string;
      timestamp: string;
    }
  | {
      type: 'usage';
      usage: {
        input_tokens: number;
        cached_input_tokens: number;
        output_tokens: number;
      };
      timestamp: string;
    }
  | {
      type: 'error';
      message: string;
      timestamp: string;
    };

export interface CodexSdkSessionSummary {
  id: string;
  org: string;
  repo: string;
  branch: string;
  label: string;
  createdAt: string;
  lastActivityAt: string | null;
}

export interface CodexSdkSessionDetail {
  session: CodexSdkSessionSummary;
  events: CodexSdkEvent[];
}

export type CodexSdkSessionMetadata = CodexSdkSessionSummary;
