// Shopify global ID helpers. Webhooks carry numeric ids; GraphQL uses gids.

export function toGid(type: string, id: string | number): string {
  const s = String(id);
  return s.startsWith("gid://") ? s : `gid://shopify/${type}/${s}`;
}

export function legacyId(gidOrId: string | number): string {
  const s = String(gidOrId);
  const tail = s.split("/").pop() ?? s;
  return tail.split("?")[0];
}
