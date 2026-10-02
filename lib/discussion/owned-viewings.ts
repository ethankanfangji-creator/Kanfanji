export type DiscussionViewingRow = {
  id: string;
  address: string;
  user_id: string | null;
};

export function discussionHousesForOwner(
  viewingIds: string[],
  viewings: DiscussionViewingRow[],
  ownerUserId: string,
): Array<{ id: string; address: string }> {
  const owned = new Map(
    viewings
      .filter((viewing) => viewing.user_id === ownerUserId)
      .map((viewing) => [viewing.id, viewing.address] as const),
  );
  return viewingIds.flatMap((id) => {
    const address = owned.get(id);
    return address ? [{ id, address }] : [];
  });
}
