/**
 * `get_category_tree` — S06/S19's whole taxonomy, flattened depth-first.
 *
 * Offline-eligible and auto-eligible: `categories` is one of the shared
 * tables (`architecture/14-local-first.md`), and the walk is a plain
 * structural read with nothing server-only about it.
 */

import { z } from "zod";
import type { OperationContext } from "../../registry/context.ts";
import { defineOperation } from "../../registry/define.ts";
import { listCategoryTree } from "./categories.service.ts";

export const getCategoryTree = defineOperation({
  name: "get_category_tree",
  kind: "read",
  autoEligible: true,
  offlineEligible: true,
  opVersion: 1,
  description:
    "The whole category tree, groups and leaves both, flattened depth-first with each row's " +
    "depth from its root. Archived categories are excluded unless includeArchived is true — " +
    "only a leaf may be assigned to a transaction.",
  input: z.object({
    includeArchived: z.boolean().default(false),
  }),
  handler: (input, ctx: OperationContext) => listCategoryTree(ctx.db, input.includeArchived),
});
