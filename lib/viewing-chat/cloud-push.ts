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
  const putOnce = (revision: number) =>
    fetchImpl(`/api/viewing-chat/threads/${input.threadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: revision,
        messages: input.messages,
        chatState: input.chatState,
        clientUpdatedAt: input.clientUpdatedAt,
      }),
    });
  const createRow = () =>
    fetchImpl("/api/viewing-chat/threads", {
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

  let revision = input.baseRevision;
  if (revision == null) {
    const current = await fetchImpl(`/api/viewing-chat/threads/${input.threadId}`);
    if (current.status === 404) {
      const created = await createRow();
      if (!created.ok) return { status: created.status };
      const createdBody = (await created.json()) as { revision?: number };
      revision = createdBody.revision ?? 1;
    } else if (!current.ok) {
      return { status: current.status };
    } else {
      const body = (await current.json()) as CloudRow;
      revision = body.revision ?? 1;
    }
  }

  let response = await putOnce(revision);
  if (response.status === 404) {
    const created = await createRow();
    if (!created.ok) return { status: created.status };
    const createdBody = (await created.json()) as { revision?: number };
    response = await putOnce(createdBody.revision ?? 1);
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
