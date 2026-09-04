/**
 * `<CategoryTree>` — `screens/S19-settings-categories.md` §3, §4. Groups
 * collapsible-by-depth, leaves indented under them, a `Tag` row per leaf for
 * usage count · archived · unused.
 *
 * **Pure presentation over a flat, already-ordered list.** The screen owns
 * search, the archived toggle, and sort order — this renders exactly the
 * `nodes` it is handed, depth-indented, the same "structural rather than
 * imported" shape `CategorySheet` (`category-sheet.tsx`) already uses for
 * `packages/ledger`'s `LocalCategory`.
 *
 * **A trailing `IconButton`, not the whole row, opens the actions sheet.**
 * Long-press is the plan's other affordance; this is the one with no gap on
 * web, where nothing presses long, and no `nested-interactive` risk from
 * making an entire row a second control around a control.
 */

import { useCallback } from "react";
import { Text, View } from "react-native";
import { useT } from "../i18n/provider";
import { IconButton } from "../primitives/icon-button";
import { Tag } from "../primitives/tag";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { radius, space, touchTarget } from "../tokens.ts";

export type CategoryTreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
  archived: boolean;
  /** 0 for a root category, incrementing one per ancestor — indentation. */
  depth: number;
  /** How many live rows touch this category — `readCategoryUsage`. */
  usageCount: number;
};

export type CategoryTreeProps = {
  nodes: readonly CategoryTreeNode[];
  onOpenActions: (id: string) => void;
};

export function CategoryTree({ nodes, onOpenActions }: CategoryTreeProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      {nodes.map((node) => (
        <CategoryTreeRow key={node.id} node={node} onOpenActions={onOpenActions} />
      ))}
    </View>
  );
}

type CategoryTreeRowProps = {
  node: CategoryTreeNode;
  onOpenActions: (id: string) => void;
};

/** The "more" glyph — three soft squares, matching `tab-icons.tsx`'s rule against a circle. */
function MoreGlyph() {
  const styles = useStyles();
  return (
    <View style={styles.moreGlyph}>
      <View style={styles.moreDot} />
      <View style={styles.moreDot} />
      <View style={styles.moreDot} />
    </View>
  );
}

function CategoryTreeRow({ node, onOpenActions }: CategoryTreeRowProps) {
  const t = useT();
  const styles = useStyles();

  const handleOpenActions = useCallback(() => onOpenActions(node.id), [onOpenActions, node.id]);
  const indent = { paddingLeft: space.x4 * node.depth };

  return (
    <View style={[styles.row, indent]}>
      <View style={styles.copy}>
        <Text style={[styles.name, node.isLeaf ? null : styles.groupName]} numberOfLines={1}>
          {node.name}
        </Text>
        {node.isLeaf ? (
          <View style={styles.tags}>
            <Tag variant="neutral">
              {node.usageCount === 1
                ? t("categories.usageOne", { count: node.usageCount })
                : t("categories.usageMany", { count: node.usageCount })}
            </Tag>
            {node.archived ? <Tag variant="warn">{t("categories.archived")}</Tag> : null}
            {!node.archived && node.usageCount === 0 ? (
              <Tag variant="negative">{t("categories.unused")}</Tag>
            ) : null}
          </View>
        ) : null}
      </View>
      <IconButton
        label={t("categories.actionsFor", { name: node.name })}
        onPress={handleOpenActions}
        size={32}
      >
        <MoreGlyph />
      </IconButton>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  root: { gap: 0 },
  row: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    gap: space.x3,
    paddingVertical: space.sm,
  },
  copy: { flex: 1, gap: space.xs },
  name: { color: theme.text, ...text.ui("body") },
  groupName: { color: theme.textMuted, ...text.ui("body", 600), textTransform: "uppercase" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  moreGlyph: {
    width: 16,
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moreDot: { width: 3, height: 3, borderRadius: radius.xs, backgroundColor: theme.textMuted },
}));
