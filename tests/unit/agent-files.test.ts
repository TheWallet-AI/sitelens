import { test, expect } from "vitest";
import {
  aiJson,
  aiTxt,
  llmsFullTxt,
  llmsTxt,
} from "../../src/server/meta/agent-files";
import { validateResource } from "../../src/core/resources";

const origin = "https://sitelens.example.com";
const check = (
  kind: Parameters<typeof validateResource>[0],
  body: string,
  type: string,
) =>
  validateResource(
    kind,
    { status: 200, contentType: type, body, finalUrl: origin + "/x" },
    origin,
  );

test("SiteLens's own files pass its own validators", () => {
  expect(check("llms_txt", llmsTxt(origin), "text/markdown").state).toBe(
    "valid",
  );
  expect(
    check("llms_full_txt", llmsFullTxt(origin), "text/markdown").state,
  ).toBe("valid");
  expect(check("ai_txt", aiTxt(origin), "text/plain").state).toBe("valid");
  expect(
    check("ai_json", JSON.stringify(aiJson(origin)), "application/json").state,
  ).toBe("valid");
});

test("no public API or MCP server is claimed", () => {
  expect(aiJson(origin).publicApi).toBeNull();
  expect(aiJson(origin).mcp).toBeNull();
  expect(llmsTxt(origin)).not.toMatch(/openapi|\.well-known\/mcp/i);
  expect(aiTxt(origin)).toMatch(/No MCP server or OpenAPI document is offered/);
});
