import {
  appOrigin,
  llmsTxt,
  textResponse,
} from "../../server/meta/agent-files";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return textResponse(llmsTxt(appOrigin(request)), "text/markdown");
}
