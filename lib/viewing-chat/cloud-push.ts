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
  askedCount?: Record<string, number>;
  pinned?: boolean;
  sitePin?: { lat: number; lng: number; source: "civic" | "map" } | null;
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
    askedCount: thread.askedCount ?? {},
    pinned: Boolean(thread.pinned),
    ...(thread.sitePin ? { sitePin: thread.sitePin } : {}),
  };
}

export function syncedThreadIdsMissingFromCloud(
  local: Array<{ id: string; ownerUserId?: string | null; cloud?: { state?: string } | null }>,
  remoteIds: ReadonlySet<string>,
  userId: string,
) {
  return local
    .filter(
      (thread) =>
        thread.ownerUserId === userId &&
        thread.cloud?.state === "synced" &&
        !remoteIds.has(thread.id),
    )
    .map((thread) => thread.id);
}

export async function pushViewingThread(input: {
  threadId: string;
  address: string;
  baseRevision?: number;
  previouslySynced?: boolean;
  messages: unknown[];
  chatState: Record<string, unknown>;
  clientUpdatedAt: string;
  report?: unknown;
  metadata?: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; revision?: number; remote?: CloudRow; deleted?: boolean }> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const previouslySynced = input.previouslySynced === true || typeof input.baseRevision === "number";
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

  const finish = async (response: Response, deleted = false) => {
    if (deleted) return { status: 404, deleted: true };
    if (response.status === 409) {
      const remoteResponse = await fetchImpl(`/api/viewing-chat/threads/${input.threadId}`);
      if (!remoteResponse.ok) return { status: 409 };
      const remote = (await remoteResponse.json()) as CloudRow;
      return { status: 409, revision: remote.revision, remote };
    }
    if (!response.ok) return { status: response.status };
    const body = (await response.json()) as { revision?: number };
    return { status: response.status, revision: body.revision };
  };

  if (input.baseRevision == null) {
    if (previouslySynced) {
      const current = await fetchImpl(`/api/viewing-chat/threads/${input.threadId}`);
      if (current.status === 404) return { status: 404, deleted: true };
      if (!current.ok) return { status: current.status };
      const remote = (await current.json()) as CloudRow;
      return { status: 409, revision: remote.revision, remote };
    }
    const created = await createRow();
    if (!created.ok) return { status: created.status };
    const createdBody = (await created.json()) as { revision?: number };
    return finish(await putOnce(createdBody.revision ?? 1));
  }

  let response = await putOnce(input.baseRevision);
  if (response.status === 404) {
    if (previouslySynced) return { status: 404, deleted: true };
    const created = await createRow();
    if (!created.ok) return { status: created.status };
    const createdBody = (await created.json()) as { revision?: number };
    response = await putOnce(createdBody.revision ?? 1);
  }
  return finish(response);
}
