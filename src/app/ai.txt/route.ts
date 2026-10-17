import { aiTxt, appOrigin, textResponse } from "../../server/meta/agent-files";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return textResponse(aiTxt(appOrigin(request)), "text/plain");
}
