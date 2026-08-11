import {
  AbstractCliProvider,
  buildImagePrompt,
} from "./AbstractCliProvider.js";
import type { CliGenerateRequest } from "../types.js";
import type { ProcessResult } from "../processRunner.js";
import { CompanionRequestError } from "../security.js";

const RESULT_SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  properties: {
    output_file: { type: "string", const: "output.png" },
    model: { type: "string" },
  },
  required: ["output_file"],
});

export class ClaudeCliProvider extends AbstractCliProvider {
  protected readonly provider = "claude" as const;
  protected readonly executable: string;
  private readonly imageTool: string | undefined;

  public constructor(
    executable = process.env.TEAPOT_CLAUDE_CLI ?? "claude",
    imageTool = process.env.TEAPOT_CLAUDE_IMAGE_TOOL,
    processEnv?: Readonly<NodeJS.ProcessEnv>,
    inheritProcessEnv = true,
  ) {
    super(processEnv, inheritProcessEnv);
    this.executable = executable;
    this.imageTool = imageTool;
  }

  public override async capabilities() {
    const base = await super.capabilities();
    if (!base.installed) return base;
    if (!this.imageTool || !/^[a-zA-Z0-9_:.-]{1,180}$/.test(this.imageTool)) {
      return {
        ...base,
        imageGeneration: "unavailable" as const,
        reason:
          "Set TEAPOT_CLAUDE_IMAGE_TOOL to a trusted installed Claude image-generation tool",
      };
    }
    return base;
  }

  protected async buildArguments(
    jobDir: string,
    _resultPath: string,
    request: CliGenerateRequest,
  ): Promise<string[]> {
    if (!this.imageTool || !/^[a-zA-Z0-9_:.-]{1,180}$/.test(this.imageTool)) {
      throw new CompanionRequestError(
        "Claude image generation is not configured",
        503,
      );
    }
    const args = [
      "--print",
      "--no-session-persistence",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      this.imageTool,
      "--add-dir",
      jobDir,
      "--output-format",
      "json",
      "--json-schema",
      RESULT_SCHEMA,
    ];
    if (request.model) args.push("--model", request.model);
    args.push(buildImagePrompt(request));
    return Promise.resolve(args);
  }

  protected async parseStructuredResult(
    _resultPath: string,
    processResult: ProcessResult,
  ): Promise<{ output_file: string; model?: string }> {
    try {
      const envelope: unknown = JSON.parse(processResult.stdout);
      if (!envelope || typeof envelope !== "object")
        throw new Error("not an object");
      const structured = (envelope as { structured_output?: unknown })
        .structured_output;
      const candidate = structured ?? (envelope as { result?: unknown }).result;
      const parsed =
        typeof candidate === "string"
          ? (JSON.parse(candidate) as unknown)
          : candidate;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        (parsed as { output_file?: unknown }).output_file !== "output.png"
      ) {
        throw new Error("missing output path");
      }
      const model = (parsed as { model?: unknown }).model;
      return {
        output_file: "output.png",
        ...(typeof model === "string" ? { model } : {}),
      };
    } catch {
      throw new CompanionRequestError(
        "Claude CLI returned an invalid result",
        502,
      );
    }
  }
}
