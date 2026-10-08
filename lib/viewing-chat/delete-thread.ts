import { deleteLocalThread, getLocalThread } from "./local-store";

export async function deleteViewingThread(input: {
  id: string;
  userId: string | null;
  fetchImpl?: typeof fetch;
}): Promise<"removed" | "failed" | "local"> {
  if (!getLocalThread(input.id)) return "failed";
  if (!input.userId) {
    deleteLocalThread(input.id);
    return "local";
  }
  try {
    const response = await (input.fetchImpl ?? fetch)(`/api/viewing-chat/threads/${input.id}`, {
      method: "DELETE",
    });
    // 404: never created, already deleted elsewhere, or claim never landed.
    // Treat it as gone so history delete cannot get stuck on a local-only row.
    if (response.status === 404) {
      deleteLocalThread(input.id);
      return "removed";
    }
    if (!response.ok) return "failed";
    deleteLocalThread(input.id);
    return "removed";
  } catch {
    return "failed";
  }
}
