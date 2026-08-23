export function postLoginRedirect(search: string) {
  const requested = new URLSearchParams(search).get("redirect");
  if (!requested || requested.startsWith("//")) return "/";

  const isInviteFlow = requested === "/join"
    || requested.startsWith("/join/")
    || requested.startsWith("/join?");

  return isInviteFlow ? requested : "/";
}
