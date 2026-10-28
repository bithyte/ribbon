import type { Layout } from "@ribbon/layout";
import { SEPARATOR } from "./constants.ts";
import { RenderSegments } from "./segments.ts";
import type { RenderInputs } from "./types.ts";

/** Renders a layout to status line text. Never throws. */
export class Renderer {
  private constructor() {}

  /** One line per row that has any text, each ending in `"\n"`; `""` when none do. Never throws. */
  public static render(layout: Layout, inputs: RenderInputs): string {
    return layout.rows
      .map((row) =>
        row
          .map((segment) => RenderSegments.render(segment, inputs))
          .filter((text) => text !== undefined)
          .join(SEPARATOR),
      )
      .filter((line) => line !== "")
      .map((line) => `${line}\n`)
      .join("");
  }
}
