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

import type * as money from "@waltning/core/money";
import { useCallback, useMemo } from "react";
import { Text, View } from "react-native";
import { Amount } from "../../../fx/atoms/amount/amount";
import { useT } from "../../../i18n/provider";
import { IconButton } from "../../../primitives/atoms/icon-button/icon-button";
import { Tag } from "../../../primitives/atoms/tag";
import { categoryTintFor } from "../../../primitives/monogram.ts";
import { text } from "../../../theme/fonts.ts";
import { useTheme } from "../../../theme/provider";
import { makeStyles } from "../../../theme/styles.ts";
import { radius, space, touchTarget } from "../../../tokens.ts";

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
  /**
   * The seed's own tag (`seed:uncategorized`, say) — never rendered here,
   * carried only so a caller's own "is this the seeded row" match
   * (`categories-screen.tsx`'s `isUncategorized`) doesn't have to fall back
   * to matching by shape. Optional: a fixture that doesn't care can omit it.
   */
  externalId?: string | null;
  /**
   * **What went here this month**, in the pivot — S19's *Where money went*: a
   * group's is its children's together. Absent where nothing was spent, or on
   * a screen that does not say.
   */
  spent?: { amount: money.Money; currency: string; decimals: number };
  /** `spent` against the month's largest category, `0..1` — the bar's length. */
  share?: number;
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
  const theme = useTheme();
  const tint = categoryTintFor(node.name, theme);
  const mark = useMemo(() => ({ backgroundColor: tint.solid }), [tint.solid]);
  const bar = useMemo(
    () => ({
      width: `${Math.round(Math.max(0, Math.min(1, node.share ?? 0)) * 100)}%` as const,
      backgroundColor: tint.solid,
    }),
    [node.share, tint.solid],
  );

  const handleOpenActions = useCallback(() => onOpenActions(node.id), [onOpenActions, node.id]);
  const indent = { paddingLeft: space.x4 * node.depth };

  return (
    <View style={[styles.row, indent]}>
      {node.isLeaf ? <View style={[styles.mark, mark]} /> : null}
      <View style={styles.copy}>
        <Text style={[styles.name, node.isLeaf ? null : styles.groupName]} numberOfLines={1}>
          {node.name}
        </Text>
        {node.isLeaf ? (
          <View style={styles.tags}>
            {/*
              The count is meta, not a badge: an uppercase pill on every row
              outweighed the name it described.
            */}
            <Text style={styles.meta}>
              {node.usageCount === 1
                ? t("categories.usageOne", { count: node.usageCount })
                : t("categories.usageMany", { count: node.usageCount })}
            </Text>
            {node.archived ? <Tag variant="warn">{t("categories.archived")}</Tag> : null}
            {!node.archived && node.usageCount === 0 ? (
              <Tag variant="negative">{t("categories.unused")}</Tag>
            ) : null}
          </View>
        ) : null}
      </View>
      {node.spent === undefined ? null : (
        <View style={styles.figure}>
          <Amount
            value={node.spent.amount}
            currency={node.spent.currency}
            decimals={node.spent.decimals}
            size="small"
            emphasis={node.isLeaf ? "default" : "muted"}
          />
          {node.isLeaf ? (
            <View style={styles.track}>
              <View style={[styles.fill, bar]} />
            </View>
          ) : null}
        </View>
      )}
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
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs },
  meta: { color: theme.textMuted, ...text.ui("caption") },
  /** The category's mark — its solid, the colour it carries everywhere else. */
  mark: { width: 10, height: 10, borderRadius: radius.xs },
  figure: { alignItems: "flex-end", gap: space.xs, minWidth: 76 },
  track: { width: 76, height: 4, borderRadius: radius.xs, backgroundColor: theme.subtleFill },
  fill: { height: 4, borderRadius: radius.xs },
  moreGlyph: {
    width: 16,
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  moreDot: { width: 3, height: 3, borderRadius: radius.xs, backgroundColor: theme.textMuted },
}));
