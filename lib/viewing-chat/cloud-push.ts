export type CloudRow = {
  messages?: unknown[];
  revision?: number;
  chat_state?: unknown;
  updated_at?: string;
  report?: unknown;
  address?: string;
  metadata?: unknown;
};

export function buildChatStatePayload(thread: {
  address: string;
  normalizedAddress?: string | null;
  propertyRecord?: unknown;
  propertyEvidence?: unknown;
  agendaActiveId?: string | null;
  agendaSkippedIds?: string[];
  collectionSkippedFields?: unknown;
  collectionFocusFieldIds?: unknown;
  conversationStatus?: string;
  pendingConfirm?: unknown;
  pinned?: boolean;
}) {
  return {
    v: 1 as const,
    normalizedAddress: thread.normalizedAddress ?? thread.address,
    propertyRecord: thread.propertyRecord ?? null,
    propertyEvidence: thread.propertyEvidence ?? [],
    agendaActiveId: thread.agendaActiveId ?? null,
    agendaSkippedIds: thread.agendaSkippedIds ?? [],
    collectionSkippedFields: thread.collectionSkippedFields ?? [],
    collectionFocusFieldIds: thread.collectionFocusFieldIds ?? [],
    conversationStatus: thread.conversationStatus ?? "collecting",
    pendingConfirm: thread.pendingConfirm ?? null,
    pinned: Boolean(thread.pinned),
  };
}

export async function pushViewingThread(input: {
  threadId: string;
  address: string;
  baseRevision?: number;
  messages: unknown[];
  chatState: Record<string, unknown>;
  clientUpdatedAt: string;
  report?: unknown;
  metadata?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; revision?: number; remote?: CloudRow }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const putBody = JSON.stringify({
    ...(input.baseRevision ? { baseRevision: input.baseRevision } : {}),
    messages: input.messages,
    chatState: input.chatState,
    clientUpdatedAt: input.clientUpdatedAt,
  });
  const put = () =>
    fetchImpl(`/api/viewing-chat/threads/${input.threadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: putBody,
    });

  let response = await put();
  if (response.status === 404) {
    const created = await fetchImpl("/api/viewing-chat/threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        threadId: input.threadId,
        address: input.address,
        messages: input.messages,
        report: input.report ?? null,
        metadata: input.metadata ?? null,
        chatState: input.chatState,
        clientUpdatedAt: input.clientUpdatedAt,
      }),
    });
    if (!created.ok) return { status: created.status };
    response = await put();
  }
  if (response.status === 409) {
    const remoteResponse = await fetchImpl(`/api/viewing-chat/threads/${input.threadId}`);
    if (!remoteResponse.ok) return { status: 409 };
    const remote = (await remoteResponse.json()) as CloudRow;
    return { status: 409, revision: remote.revision, remote };
  }
  if (!response.ok) return { status: response.status };
  const body = (await response.json()) as { revision?: number };
  return { status: response.status, revision: body.revision };
}
