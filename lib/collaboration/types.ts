export type ViewingRole = "viewer" | "commenter" | "editor" | "owner";
export type MemberRole = Exclude<ViewingRole, "owner">;

export type ViewingMember = {
  id: string;
  viewingId: string;
  userId: string;
  role: MemberRole;
  status: "active" | "revoked";
  displayEmail: string | null;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type ViewingInvite = {
  id: string;
  viewingId: string;
  email: string;
  role: MemberRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export type ViewingComment = {
  id: string;
  viewingId: string;
  authorId: string;
  authorLabel: string;
  body: string;
  anchor: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type CollaborationOverview = {
  role: ViewingRole;
  revision: number;
  members: ViewingMember[];
  invites: ViewingInvite[];
  comments: ViewingComment[];
};

export const ROLE_RANK: Record<ViewingRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

export function roleAtLeast(role: ViewingRole, required: ViewingRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

