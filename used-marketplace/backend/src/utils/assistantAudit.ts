import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import type { AssistantAuditEvent } from '../types/assistant';

const ASSISTANT_AUDIT_LOG_DIR = path.resolve(process.cwd(), 'logs');
const ASSISTANT_AUDIT_LOG_FILE = path.join(
  ASSISTANT_AUDIT_LOG_DIR,
  'assistant-tool-calls.log'
);

export async function logAssistantToolCall(event: AssistantAuditEvent): Promise<void> {
  const serialized = JSON.stringify(event);

  console.info(`[Assistant Audit] ${serialized}`);

  try {
    await mkdir(ASSISTANT_AUDIT_LOG_DIR, { recursive: true });
    await appendFile(ASSISTANT_AUDIT_LOG_FILE, `${serialized}\n`, 'utf8');
  } catch (error) {
    console.error('[Assistant Audit] Failed to persist tool call log:', error);
  }
}
