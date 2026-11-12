import { isEnabled } from "./flags";
import { getText } from "./settings";

/** Is sign-up open? Always, unless Pre-launch is on — then only with the early-access code. */
export async function signupOpen(code?: string | null) {
  if (!(await isEnabled("PRELAUNCH"))) return true;
  const want = (await getText("earlyAccessCode")).trim();
  return !!want && !!code && code.trim().toLowerCase() === want.toLowerCase();
}

export const prelaunch = () => isEnabled("PRELAUNCH");
