import { sqliteKit as k } from "./kit.ts";

/** The unique index on the normalised name stays in `packages/db`. */
export const tagsColumns = () => ({
  id: k.id<"tags">("id"),
  name: k.text("name").notNull(),
});

export const tags = k.table("tags", tagsColumns());
