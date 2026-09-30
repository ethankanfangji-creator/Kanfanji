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
  const response = await (input.fetchImpl ?? fetch)(`/api/viewing-chat/threads/${input.id}`, {
    method: "DELETE",
  });
  if (!response.ok) return "failed";
  deleteLocalThread(input.id);
  return "removed";
}
