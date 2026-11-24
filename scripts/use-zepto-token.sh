#!/bin/bash
# Try the ZeptoMail token on the clipboard as the live app's token. Nothing is
# printed or saved to a file. If a test email does not go out, the old token is put back.
#   bash scripts/use-zepto-token.sh
cd "$(dirname "$0")/.." || exit 1
new="$(pbpaste | tr -d '\r\n' | sed 's/^ *//; s/ *$//')"
case "$new" in
  "Zoho-enczapikey "*) ;;
  *) echo "The clipboard does not hold a ZeptoMail token (it starts with: Zoho-enczapikey)."; exit 1 ;;
esac
old="$(npx convex env get ZEPTO_API_TOKEN 2>/dev/null)"
[ -n "$old" ] || { echo "Could not read the current token. Nothing changed."; exit 1; }
if [ "$new" = "$old" ]; then
  echo "SAME: this is the token already in use. The ZeptoMail account needs credits."
  exit
fi
printf %s "$new" | npx convex env set ZEPTO_API_TOKEN >/dev/null 2>&1 || { echo "Could not set it. Nothing changed."; exit 1; }
out="$(npx convex run recruitment:mailCheck 2>/dev/null)"
case "$out" in
  *"HTTP 20"*) echo "DIFFERENT, and it works: email is on. A test is in the hr@ecultify.com inbox." ;;
  *) printf %s "$old" | npx convex env set ZEPTO_API_TOKEN >/dev/null 2>&1
     echo "DIFFERENT, but the test failed, so the old one is back. ZeptoMail said: $out" ;;
esac
