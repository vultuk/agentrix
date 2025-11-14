import {
  createCodexSdkSession,
  listCodexSdkSessions,
  getCodexSdkSessionDetails,
  deleteCodexSdkSession,
  sendCodexSdkUserMessage,
} from '../core/codex-sdk-sessions.js';
import type { CodexSdkEvent, CodexSdkSessionSummary } from '../types/codex-sdk.js';

export interface CodexSdkSessionDetail {
  session: CodexSdkSessionSummary;
  events: CodexSdkEvent[];
}

export class CodexSdkService {
  constructor(private readonly workdir: string) {}

  async listSessions(input: { org: string; repo: string; branch: string }): Promise<CodexSdkSessionSummary[]> {
    return listCodexSdkSessions({ ...input, workdir: this.workdir });
  }

  async createSession(input: {
    org: string;
    repo: string;
    branch: string;
    label?: string;
  }): Promise<CodexSdkSessionDetail> {
    const result = await createCodexSdkSession({ ...input, workdir: this.workdir });
    return { session: result.summary, events: result.events };
  }

  async getSession(sessionId: string): Promise<CodexSdkSessionDetail | null> {
    const details = getCodexSdkSessionDetails(sessionId);
    return details ? { session: details.summary, events: details.events } : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await deleteCodexSdkSession(sessionId);
  }

  async sendMessage(sessionId: string, text: string): Promise<void> {
    await sendCodexSdkUserMessage(sessionId, text);
  }
}

export function createCodexSdkService(workdir: string): CodexSdkService {
  return new CodexSdkService(workdir);
}
