import { PROGRAM } from "../config";
import { getAccessToken } from "../auth/google-token";

export type CommandResponse = {
  ok: boolean;
  error?: string;
  uncertain?: boolean;
  replayed?: boolean;
  found?: boolean;
  wrote?: boolean;
  actor?: string;
  result?: Record<string, unknown>;
};

type CommandBody = Record<string, unknown>;

async function postJson(body: CommandBody): Promise<CommandResponse> {
  const res = await fetch(PROGRAM.studentServiceUrl, {
    method: "POST",
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as CommandResponse;
  } catch {
    return { ok: false, error: "network", uncertain: true };
  }
}

/**
 * Instructor mutations go to the existing Apps Script service.
 * The access token is in the JSON body. It is not an ID token and not a header.
 * A lost response is resolved with the same mutation id.
 */
export async function postInstructorCommand(
  command: string,
  payload: CommandBody,
  mutationId: string,
  token = getAccessToken(),
): Promise<CommandResponse> {
  if (!token) return { ok: false, error: "sign_in" };
  const send = (name: string, extra: CommandBody) =>
    postJson({
      action: "command",
      accessToken: token,
      command: name,
      mutationId,
      ...extra,
    });
  try {
    const first = await send(command, payload);
    if (first.ok || (first.error && !first.uncertain && first.error !== "network")) return first;
    const status = await send("mutation_status", {});
    if (status.found || status.replayed) return { ...status, ok: true, replayed: true };
    return send(command, payload);
  } catch {
    try {
      const status = await send("mutation_status", {});
      if (status.found || status.replayed) return { ...status, ok: true, replayed: true };
    } catch {
      return { ok: false, error: "network", uncertain: true };
    }
    return { ok: false, error: "network", uncertain: true };
  }
}
