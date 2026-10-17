import {
  appOrigin,
  llmsFullTxt,
  textResponse,
} from "../../server/meta/agent-files";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return textResponse(llmsFullTxt(appOrigin(request)), "text/markdown");
}
