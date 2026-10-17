import { aiJson, appOrigin, textResponse } from "../../server/meta/agent-files";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return textResponse(
    JSON.stringify(aiJson(appOrigin(request)), null, 2) + "\n",
    "application/json",
  );
}
