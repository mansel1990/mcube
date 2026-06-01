/** Hard-coded stocks admin — only this user can add/remove accounts. */
export const STOCKS_ADMIN_USERNAME = "sanjay";

export function isStocksAdmin(username: string | undefined | null): boolean {
  return username?.trim().toLowerCase() === STOCKS_ADMIN_USERNAME;
}

export function getStocksSessionUsername(user: Record<string, unknown>): string {
  return (user.username as string) || (user.name as string) || "";
}
