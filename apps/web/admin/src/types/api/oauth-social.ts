export type OAuthLinkedIdentity = {
  provider: string;
  email: string | null;
  created_at: string;
};

export type OAuthLinkedIdentityListOut = {
  identities: OAuthLinkedIdentity[];
};
