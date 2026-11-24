/** A failed ZeptoMail send in plain words, from the error text we log. "" when it says nothing useful. */
export function mailProblem(error: string): string {
  if (/LE_102|credit exhausted/i.test(error)) return "The ZeptoMail account is out of credits. Top it up, then send again.";
  if (/SERR_157|invalid api token/i.test(error)) return "ZeptoMail did not accept the app's API token.";
  // Comes back as a 401 as well, but it is about one person's address.
  if (/SMI_116|invalid email address|no valid recipients/i.test(error)) return "Their email address is not valid.";
  return "";
}

/** True when the same thing would stop every other email too. */
export const stopsEverySend = (error: string) => /LE_102|credit exhausted|SERR_157|invalid api token/i.test(error);
