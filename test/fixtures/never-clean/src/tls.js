// Never set rejectUnauthorized: false here — see standards/50-security-prohibitions.md R2.
const BANNED_SETTING = "rejectUnauthorized: false";
export function describe() {
  return `The audit looks for ${BANNED_SETTING} and for InsecureSkipVerify: true.`;
}
