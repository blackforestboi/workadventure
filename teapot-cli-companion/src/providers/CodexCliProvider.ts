import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AbstractCliProvider,
  buildImagePrompt,
} from "./AbstractCliProvider.js";
import type { CliGenerateRequest } from "../types.js";
import type { ProcessResult } from "../processRunner.js";
import { CompanionRequestError } from "../security.js";

const RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    output_file: { type: "string", const: "output.png" },
  },
  required: ["output_file"],
} as const;

export class CodexCliProvider extends AbstractCliProvider {
  protected readonly provider = "codex" as const;
  protected readonly executable: string;

  public constructor(
    executable = process.env.TEAPOT_CODEX_CLI ?? "codex",
    processEnv?: Readonly<NodeJS.ProcessEnv>,
    inheritProcessEnv = true,
  ) {
    super(processEnv, inheritProcessEnv);
    this.executable = executable;
  }

  protected async buildArguments(
    jobDir: string,
    resultPath: string,
    request: CliGenerateRequest,
  ): Promise<string[]> {
    const schemaPath = join(jobDir, "result.schema.json");
    await writeFile(schemaPath, JSON.stringify(RESULT_SCHEMA), { mode: 0o600 });
    const args = [
      "exec",
      "--config",
      'cli_auth_credentials_store="file"',
      "--enable",
      "image_generation",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "workspace-write",
      "--cd",
      jobDir,
      "--output-schema",
      schemaPath,
      "--output-last-message",
      resultPath,
    ];
    if (request.model) args.push("--model", request.model);
    args.push(buildImagePrompt(request));
    return args;
  }

  protected async parseStructuredResult(
    resultPath: string,
    _processResult: ProcessResult,
  ): Promise<{
    output_file: string;
    model?: string;
  }> {
    try {
      return parseResult(await readFile(resultPath, "utf8"));
    } catch (error) {
      if (error instanceof CompanionRequestError) throw error;
      throw new CompanionRequestError(
        "Codex CLI returned an invalid result",
        502,
      );
    }
  }
}

function parseResult(value: string): { output_file: string; model?: string } {
  const parsed: unknown = JSON.parse(value);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { output_file?: unknown }).output_file !== "output.png"
  ) {
    throw new CompanionRequestError(
      "Codex CLI returned an invalid output path",
      502,
    );
  }
  return { output_file: "output.png" };
}
