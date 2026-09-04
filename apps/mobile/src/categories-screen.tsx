/**
 * S19 · Settings · Categories — `screens/S19-settings-categories.md`.
 *
 * Loading is instant from cache (§6 — SQLite reads are synchronous), Empty
 * does not apply (the taxonomy is seeded), so this composes one populated
 * layout: search, the collision finder, `Uncategorized` apart, the tree, and
 * one actions sheet plus its three follow-on sheets.
 *
 * **`Uncategorized`'s trend and *Review with agent* are arc-full — not
 * built here.** The row still shows its count (found by name at the root,
 * the same way `TAXONOMY.md`'s seed names it; there is no reserved id), just
 * as a plain number rather than the mocked trend line.
 */

import type {
  ArchiveCategoryDraft,
  ConvertCategoryDraft,
  MergeCategoryDraft,
  MoveCategoryDraft,
  RenameCategoryDraft,
} from "@waltning/client/ledger/create-phone-ledger";
import { useLedgerController } from "@waltning/client/ledger/use-ledger-controller";
import { usePhoneLedger } from "@waltning/client/ledger/use-phone-ledger";
import { id as brandId } from "@waltning/core/id";
import { CategoryActionsSheet } from "@waltning/ui/categories/category-actions-sheet";
import { CategoryTree, type CategoryTreeNode } from "@waltning/ui/categories/category-tree";
import { CollisionFinder } from "@waltning/ui/categories/collision-finder";
import { MergeCategorySheet } from "@waltning/ui/categories/merge-category-sheet";
import { MoveCategorySheet } from "@waltning/ui/categories/move-category-sheet";
import { RenameCategorySheet } from "@waltning/ui/categories/rename-category-sheet";
import { useT } from "@waltning/ui/i18n/provider";
import { SearchField } from "@waltning/ui/primitives/search-field";
import { Tag } from "@waltning/ui/primitives/tag";
import { Toggle } from "@waltning/ui/primitives/toggle";
import { GroundPanel } from "@waltning/ui/shell/card";
import { Toast, UndoToast } from "@waltning/ui/states/toast";
import { text } from "@waltning/ui/theme/fonts";
import { makeStyles } from "@waltning/ui/theme/styles";
import { space } from "@waltning/ui/tokens";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";

type ActionsState = {
  type: "actions";
  category: { id: string; name: string; isLeaf: boolean };
  error?: string;
};
type RenameState = { type: "rename"; category: { id: string; name: string }; error?: string };
type MoveState = {
  type: "move";
  category: { id: string; name: string; kind: "income" | "expense" };
  error?: string;
};
type MergeState = {
  type: "merge";
  loser: { id: string; name: string; kind: "income" | "expense" };
  initialWinnerId: string | null;
  error?: string;
};
type SheetState = ActionsState | RenameState | MoveState | MergeState | null;

type ToastState = { message: string; undo?: () => void } | null;

/** Uncategorized is found by name at the root — the seed names it, nothing brands it. */
function isUncategorized(node: CategoryTreeNode): boolean {
  return node.parentId === null && node.name.trim().toLowerCase() === "uncategorized";
}

/**
 * The visible list: archived rows hidden unless the toggle is on,
 * `Uncategorized` shown apart rather than in the tree, and — while
 * searching — every group collapses to just the leaves that match plus the
 * group each sits under, so a hit is never orphaned from its context.
 */
function visibleTree(
  nodes: readonly CategoryTreeNode[],
  options: { search: string; showArchived: boolean },
): readonly CategoryTreeNode[] {
  const eligible = nodes.filter(
    (node) => !isUncategorized(node) && (options.showArchived || !node.archived),
  );
  const query = options.search.trim().toLowerCase();
  if (query === "") return eligible;

  const matchingLeafIds = new Set(
    eligible
      .filter((node) => node.isLeaf && node.name.toLowerCase().includes(query))
      .map((n) => n.id),
  );
  const parentIds = new Set(
    eligible
      .filter((node) => matchingLeafIds.has(node.id))
      .map((node) => node.parentId)
      .filter((id): id is string => id !== null),
  );
  return eligible.filter((node) => matchingLeafIds.has(node.id) || parentIds.has(node.id));
}

export default function CategoriesScreen() {
  const t = useT();
  const styles = useStyles();
  const ledger = useLedgerController();
  const snapshot = usePhoneLedger(ledger);

  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<ToastState>(null);

  // A refusal always names itself (every controller refusal returns exactly
  // one `fieldErrors` entry) — `couldNotSave` only guards the shape, never
  // shown in practice.
  const couldNotSave = t("common.couldNotSave");
  const messageOf = useCallback(
    (fieldErrors: readonly { message: string }[]) => fieldErrors[0]?.message ?? couldNotSave,
    [couldNotSave],
  );

  const nodes: readonly CategoryTreeNode[] = useMemo(
    () =>
      snapshot.fullCategoryTree.map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        kind: node.kind,
        isLeaf: node.isLeaf,
        archived: node.archived,
        depth: node.depth,
        usageCount: snapshot.categoryUsage.get(node.id) ?? 0,
      })),
    [snapshot.fullCategoryTree, snapshot.categoryUsage],
  );

  const uncategorized = nodes.find(isUncategorized) ?? null;
  const rows = useMemo(
    () => visibleTree(nodes, { search, showArchived }),
    [nodes, search, showArchived],
  );
  const matchedLeaves = search.trim() === "" ? undefined : rows.filter((n) => n.isLeaf).length;

  const handleClearSearch = useCallback(() => setSearch(""), []);
  const handleDismissToast = useCallback(() => setToast(null), []);
  const handleUndo = useCallback(() => {
    toast?.undo?.();
    setToast(null);
  }, [toast]);

  const handleOpenActions = useCallback(
    (id: string) => {
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node) return;
      setSheet({
        type: "actions",
        category: { id: node.id, name: node.name, isLeaf: node.isLeaf },
      });
    },
    [nodes],
  );
  const handleDismissSheet = useCallback(() => setSheet(null), []);

  const handleRename = useCallback(() => {
    if (sheet?.type !== "actions") return;
    setSheet({ type: "rename", category: sheet.category });
  }, [sheet]);

  const handleMove = useCallback(() => {
    if (sheet?.type !== "actions") return;
    const node = nodes.find((candidate) => candidate.id === sheet.category.id);
    if (!node) return;
    setSheet({ type: "move", category: { id: node.id, name: node.name, kind: node.kind } });
  }, [sheet, nodes]);

  const handleMergeFromActions = useCallback(() => {
    if (sheet?.type !== "actions") return;
    const node = nodes.find((candidate) => candidate.id === sheet.category.id);
    if (!node) return;
    setSheet({
      type: "merge",
      loser: { id: node.id, name: node.name, kind: node.kind },
      initialWinnerId: null,
    });
  }, [sheet, nodes]);

  const handleConvert = useCallback(() => {
    if (sheet?.type !== "actions") return;
    const draft: ConvertCategoryDraft = {
      id: sheet.category.id,
      to: sheet.category.isLeaf ? "group" : "leaf",
    };
    const result = ledger.convertCategory(draft);
    if ("fieldErrors" in result) {
      setSheet({ ...sheet, error: messageOf(result.fieldErrors) });
      return;
    }
    setSheet(null);
    setToast({ message: t("categories.convertToGroup") });
  }, [sheet, ledger, t, messageOf]);

  const handleArchive = useCallback(() => {
    if (sheet?.type !== "actions") return;
    const draft: ArchiveCategoryDraft = { id: sheet.category.id };
    const result = ledger.archiveCategory(draft);
    if ("fieldErrors" in result) {
      setSheet({ ...sheet, error: messageOf(result.fieldErrors) });
      return;
    }
    setSheet(null);
    // No `restore_category` operation exists (`operations.md`) — a plain
    // `Toast`, per wave-3-shared.md's named gap, not an `UndoToast` this
    // screen cannot honour.
    setToast({ message: t("categories.archive") });
  }, [sheet, ledger, t, messageOf]);

  const handleSaveRename = useCallback(
    (name: string) => {
      if (sheet?.type !== "rename") return;
      const oldName = sheet.category.name;
      const draft: RenameCategoryDraft = { id: sheet.category.id, name };
      const result = ledger.renameCategory(draft);
      if ("fieldErrors" in result) {
        setSheet({ ...sheet, error: messageOf(result.fieldErrors) });
        return;
      }
      setSheet(null);
      setToast({
        message: t("categories.rename"),
        undo: () => {
          ledger.renameCategory({ id: sheet.category.id, name: oldName });
        },
      });
    },
    [sheet, ledger, t, messageOf],
  );

  const handleSaveMove = useCallback(
    (groupId: string | null) => {
      if (sheet?.type !== "move") return;
      const before = nodes.find((candidate) => candidate.id === sheet.category.id);
      const draft: MoveCategoryDraft = { id: sheet.category.id, parentId: groupId };
      const result = ledger.moveCategory(draft);
      if ("fieldErrors" in result) {
        setSheet({ ...sheet, error: messageOf(result.fieldErrors) });
        return;
      }
      setSheet(null);
      setToast({
        message: t("categories.move"),
        ...(before
          ? {
              undo: () => {
                ledger.moveCategory({ id: sheet.category.id, parentId: before.parentId });
              },
            }
          : {}),
      });
    },
    [sheet, ledger, nodes, t, messageOf],
  );

  const handleConfirmMerge = useCallback(
    (winnerId: string) => {
      if (sheet?.type !== "merge") return;
      const draft: MergeCategoryDraft = { loserId: sheet.loser.id, winnerId };
      const result = ledger.mergeCategories(draft);
      if ("fieldErrors" in result) {
        setSheet({ ...sheet, error: messageOf(result.fieldErrors) });
        return;
      }
      setSheet(null);
      // Not reversible in one step (J12 §5) — a plain `Toast`, never `UndoToast`.
      setToast({ message: t("categories.merge") });
    },
    [sheet, ledger, t, messageOf],
  );

  const handleReviewCollision = useCallback(
    (aId: string, bId: string) => {
      const a = nodes.find((candidate) => candidate.id === aId);
      const b = nodes.find((candidate) => candidate.id === bId);
      if (!a || !b) return;
      const usageOf = (categoryId: string) =>
        snapshot.categoryUsage.get(brandId<"categories">(categoryId)) ?? 0;
      // The lower-usage side is proposed as the loser — a default the merge
      // sheet's own picker can still overrule.
      const [loser, winner] = usageOf(a.id) <= usageOf(b.id) ? [a, b] : [b, a];
      setSheet({
        type: "merge",
        loser: { id: loser.id, name: loser.name, kind: loser.kind },
        initialWinnerId: winner.id,
      });
    },
    [nodes, snapshot.categoryUsage],
  );

  const moveGroups = useMemo(() => {
    if (sheet?.type !== "move") return [];
    return nodes
      .filter(
        (node) =>
          !node.isLeaf &&
          !node.archived &&
          node.kind === sheet.category.kind &&
          node.id !== sheet.category.id,
      )
      .map((node) => ({ id: node.id, name: node.name }));
  }, [sheet, nodes]);

  const mergeCandidates = useMemo(() => {
    if (sheet?.type !== "merge") return [];
    return nodes
      .filter(
        (node) =>
          node.isLeaf &&
          !node.archived &&
          node.kind === sheet.loser.kind &&
          node.id !== sheet.loser.id,
      )
      .map((node) => ({ id: node.id, name: node.name }));
  }, [sheet, nodes]);

  const mergeCounts =
    sheet?.type === "merge"
      ? ledger.readCategoryReferenceCounts(sheet.loser.id)
      : { transactions: 0, lines: 0, rules: 0 };

  return (
    <GroundPanel>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={t("common.search")}
          onClear={handleClearSearch}
          {...(matchedLeaves === undefined ? {} : { resultCount: matchedLeaves })}
        />
        <Toggle
          label={t("categories.showArchived")}
          value={showArchived}
          onChange={setShowArchived}
        />
        <CollisionFinder
          candidates={snapshot.categoryCollisions}
          onReview={handleReviewCollision}
        />
        {uncategorized === null ? null : (
          <View style={styles.uncategorized}>
            <Text style={styles.uncategorizedName}>{uncategorized.name}</Text>
            <Tag variant="neutral">
              {uncategorized.usageCount === 1
                ? t("categories.usageOne", { count: uncategorized.usageCount })
                : t("categories.usageMany", { count: uncategorized.usageCount })}
            </Tag>
          </View>
        )}
        <CategoryTree nodes={rows} onOpenActions={handleOpenActions} />
      </ScrollView>

      <CategoryActionsSheet
        visible={sheet?.type === "actions"}
        category={sheet?.type === "actions" ? sheet.category : null}
        {...(sheet?.type === "actions" && sheet.error !== undefined ? { error: sheet.error } : {})}
        onRename={handleRename}
        onMove={handleMove}
        onConvert={handleConvert}
        onMerge={handleMergeFromActions}
        onArchive={handleArchive}
        onDismiss={handleDismissSheet}
      />
      <RenameCategorySheet
        visible={sheet?.type === "rename"}
        categoryName={sheet?.type === "rename" ? sheet.category.name : ""}
        {...(sheet?.type === "rename" && sheet.error !== undefined ? { error: sheet.error } : {})}
        onSave={handleSaveRename}
        onDismiss={handleDismissSheet}
      />
      <MoveCategorySheet
        visible={sheet?.type === "move"}
        categoryName={sheet?.type === "move" ? sheet.category.name : ""}
        groups={moveGroups}
        {...(sheet?.type === "move" && sheet.error !== undefined ? { error: sheet.error } : {})}
        onSave={handleSaveMove}
        onDismiss={handleDismissSheet}
      />
      <MergeCategorySheet
        visible={sheet?.type === "merge"}
        loserName={sheet?.type === "merge" ? sheet.loser.name : ""}
        candidates={mergeCandidates}
        counts={mergeCounts}
        initialWinnerId={sheet?.type === "merge" ? sheet.initialWinnerId : null}
        {...(sheet?.type === "merge" && sheet.error !== undefined ? { error: sheet.error } : {})}
        onConfirm={handleConfirmMerge}
        onDismiss={handleDismissSheet}
      />

      {toast === null ? null : toast.undo ? (
        <UndoToast message={toast.message} onUndo={handleUndo} onDismiss={handleDismissToast} />
      ) : (
        <Toast message={toast.message} onDismiss={handleDismissToast} />
      )}
    </GroundPanel>
  );
}

const useStyles = makeStyles((theme) => ({
  scroll: { flex: 1 },
  content: { gap: space.x4 },
  uncategorized: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  uncategorizedName: { color: theme.text, ...text.ui("body", 600) },
}));
