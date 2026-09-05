/**
 * `<CategorySheet>` — `screens/S06-category-sheet.md`. One sheet to pick a
 * category, used from Quick add, a ledger row's swipe, and the detail screen.
 *
 * **Pure presentation over the whole tree.** `readCategoryTree` (`A3`) is the
 * shape this mirrors — groups and leaves both, flattened, `parentId` self-
 * referencing — but this component takes a structural `CategoryTreeNode[]`
 * rather than importing the ledger's own type: `packages/ui` depends on
 * `@waltning/core` alone (`architecture/11`), and a value import from
 * `@waltning/ledger` would be the first thread of the dependency that rule
 * exists to keep out.
 *
 * **Composed by a screen, never by a sibling domain.** `QuickAddForm`
 * (`transactions/`) does not render this — it opens it through a callback the
 * screen owns, the same way it already escapes to account creation. A domain
 * importing a domain is the thing `architecture/11` calls out by name; this
 * sheet is reached the way `BottomSheet` (`shell/`) and `EmptyState`
 * (`states/`) are, composed at the app route.
 *
 * **Two levels, one rule (`TAXONOMY.md` R1/R2).** A group chip *narrows*; it
 * is never itself pickable — the taxonomy enforces that a category is a group
 * or a leaf, never both, so this component does not have to guard against a
 * group id reaching `onPick`. `Uncategorized` is the one leaf the taxonomy
 * seeds at the root (`parentId: null`); every other leaf sits under a group.
 *
 * **Search always covers every leaf, ignoring the chosen group (§9's open
 * question, decided).** Positions never move — no recency, no usage
 * ranking — so the fast path is search, not a reordered grid a thumb has to
 * re-read every time.
 */

import { fold } from "@waltning/core/capture/names";
import {
  type CategoryProposal,
  PROPOSAL_DISPLAY_THRESHOLD,
} from "@waltning/core/capture/payee-memory";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useT } from "../i18n/provider";
import { Button } from "../primitives/button";
import { useInteraction } from "../primitives/interaction.ts";
import { usePressScale } from "../primitives/press-scale.ts";
import { Tag } from "../primitives/tag";
import { TextField } from "../primitives/text-field";
import { BottomSheet } from "../shell/bottom-sheet";
import { EmptyState } from "../states/empty-state";
import { text } from "../theme/fonts.ts";
import { makeStyles } from "../theme/styles.ts";
import { focus, radius, space, touchTarget } from "../tokens.ts";

/**
 * One node of the flattened tree — a group (`isLeaf: false`) or a leaf, per
 * `TAXONOMY.md` R1. Structural, matching `readCategoryTree`'s own
 * `LocalCategory` and the client's `PhoneCategoryNode`.
 */
export type CategoryTreeNode = {
  id: string;
  parentId: string | null;
  name: string;
  kind: "income" | "expense";
  isLeaf: boolean;
};

/** What the create-in-place row can save. `parentId: null` is refused above the root leaf, `Uncategorized`. */
export type CategorySheetCreateDraft = {
  name: string;
  kind: "income" | "expense";
  parentId: string | null;
};

export type CategorySheetProps = {
  visible: boolean;
  /** Narrows the tree to one half of the taxonomy — the type in hand. */
  kind: "income" | "expense";
  tree: readonly CategoryTreeNode[];
  /** Leaf id → transaction count, for the number beside each leaf and `Uncategorized`. Optional (S06 §4). */
  usage?: Readonly<Record<string, number>>;
  /** D2's own proposal, already computed by the caller — this sheet never proposes on its own. */
  proposal?: CategoryProposal;
  onPick: (categoryId: string) => void;
  /**
   * Present only where creating in place is offered. `create_category` here
   * is a direct write, not a proposal (S06 §5) — a person choosing to create
   * a category has already decided.
   */
  onCreate?: (draft: CategorySheetCreateDraft) => { id: string } | { error: string };
  onDismiss: () => void;
};

export function CategorySheet({
  visible,
  kind,
  tree,
  usage,
  proposal,
  onPick,
  onCreate,
  onDismiss,
}: CategorySheetProps) {
  const t = useT();
  const styles = useStyles();
  const [query, setQuery] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createGroupId, setCreateGroupId] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const nodes = useMemo(() => tree.filter((node) => node.kind === kind), [tree, kind]);
  const groups = useMemo(() => nodes.filter((node) => !node.isLeaf), [nodes]);
  const uncategorized = useMemo(
    () => nodes.find((node) => node.isLeaf && node.parentId === null),
    [nodes],
  );
  const ordinaryLeaves = useMemo(
    () => nodes.filter((node) => node.isLeaf && node !== uncategorized),
    [nodes, uncategorized],
  );

  const searching = query.trim() !== "";
  const visibleLeaves = useMemo(() => {
    if (searching) {
      const needle = fold(query);
      return ordinaryLeaves.filter((leaf) => fold(leaf.name).includes(needle));
    }
    return groupId === null ? ordinaryLeaves : ordinaryLeaves.filter((l) => l.parentId === groupId);
  }, [groupId, ordinaryLeaves, query, searching]);

  const resetLocal = useCallback(() => {
    setQuery("");
    setGroupId(null);
    setCreating(false);
    setCreateName("");
    setCreateGroupId(null);
    setCreateError(undefined);
    setHighlighted(null);
  }, []);

  const handleDismiss = useCallback(() => {
    resetLocal();
    onDismiss();
  }, [onDismiss, resetLocal]);

  const handlePick = useCallback(
    (categoryId: string) => {
      setHighlighted(categoryId);
      onPick(categoryId);
    },
    [onPick],
  );

  const handleToggleGroup = useCallback((next: string) => {
    setGroupId((current) => (current === next ? null : next));
  }, []);

  const openCreate = useCallback(
    (prefillName: string) => {
      setCreateName(prefillName);
      setCreateGroupId(groupId);
      setCreateError(undefined);
      setCreating(true);
    },
    [groupId],
  );
  const handleOpenCreate = useCallback(() => openCreate(""), [openCreate]);
  const handleCreateFromEmpty = useCallback(() => openCreate(query.trim()), [openCreate, query]);
  const handleCancelCreate = useCallback(() => {
    setCreating(false);
    setCreateError(undefined);
  }, []);
  const handleCreateNameChange = useCallback((next: string) => setCreateName(next), []);
  const handleCreateSave = useCallback(() => {
    if (!onCreate) return;
    const name = createName.trim();
    if (name === "" || createGroupId === null) return;
    const result = onCreate({ name, kind, parentId: createGroupId });
    if ("error" in result) {
      setCreateError(result.error);
      return;
    }
    setCreating(false);
    setCreateError(undefined);
    handlePick(result.id);
  }, [createGroupId, createName, handlePick, kind, onCreate]);

  /**
   * The footer's `Use ‹leaf›` re-fires the same pick — §7: "for the case
   * where a leaf is already selected and you are double-checking; the
   * ordinary path is one tap on the leaf itself."
   */
  const handleUsePress = useCallback(() => {
    if (highlighted !== null) handlePick(highlighted);
  }, [handlePick, highlighted]);

  // `Uncategorized` is excluded from `ordinaryLeaves` (it renders in its own
  // row) but is still a pickable leaf — `Use` must resolve its name too.
  const highlightedLeaf =
    ordinaryLeaves.find((leaf) => leaf.id === highlighted) ??
    (uncategorized?.id === highlighted ? uncategorized : undefined);
  const proposedLeaf =
    proposal && !searching
      ? ordinaryLeaves.find((leaf) => leaf.id === proposal.categoryId)
      : undefined;

  const emptyBody = t("categories.noMatchBody", { query: query.trim() });
  const canCreateHere = onCreate !== undefined && groupId !== null;

  return (
    <BottomSheet visible={visible} title={t("transactions.category")} onDismiss={handleDismiss}>
      <View style={styles.grabber} />
      {proposedLeaf ? (
        <ProposalRow
          leaf={proposedLeaf}
          confidence={proposal?.confidence ?? 0}
          onPick={handlePick}
        />
      ) : null}
      <TextField
        label={t("common.search")}
        value={query}
        onChangeText={setQuery}
        placeholder={t("categories.search", { count: ordinaryLeaves.length })}
        hideLabel
      />
      {searching ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {groups.map((group) => (
            <GroupChip
              key={group.id}
              name={group.name}
              selected={group.id === groupId}
              onPress={handleToggleGroup}
              id={group.id}
            />
          ))}
        </ScrollView>
      )}
      <ScrollView style={styles.gridScroll}>
        {visibleLeaves.length === 0 ? (
          canCreateHere ? (
            <EmptyState
              variant="filtered"
              title={t("categories.noMatchTitle")}
              body={emptyBody}
              primaryAction={{
                label: t("categories.create", { query: query.trim() }),
                onPress: handleCreateFromEmpty,
              }}
            />
          ) : (
            <Text style={styles.noMatches}>{t("common.noMatches")}</Text>
          )
        ) : (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t("transactions.category")}
            style={styles.grid}
          >
            {visibleLeaves.map((leaf) => (
              <LeafCell
                key={leaf.id}
                leaf={leaf}
                count={usage?.[leaf.id]}
                selected={leaf.id === highlighted}
                onPress={handlePick}
              />
            ))}
          </View>
        )}
        {uncategorized ? (
          <UncategorizedRow
            leaf={uncategorized}
            count={usage?.[uncategorized.id]}
            selected={uncategorized.id === highlighted}
            onPress={handlePick}
          />
        ) : null}
      </ScrollView>
      {creating ? (
        <CreateRow
          groups={groups}
          groupLocked={groupId !== null}
          groupId={createGroupId}
          onGroupChange={setCreateGroupId}
          name={createName}
          onNameChange={handleCreateNameChange}
          error={createError}
          onCancel={handleCancelCreate}
          onSave={handleCreateSave}
        />
      ) : null}
      <View style={styles.footer}>
        <Button
          label={t("categories.new")}
          onPress={handleOpenCreate}
          variant="secondary"
          disabled={onCreate === undefined}
        />
        <Button
          label={
            highlightedLeaf === undefined
              ? t("categories.use")
              : t("categories.useLeaf", { name: highlightedLeaf.name })
          }
          onPress={handleUsePress}
          variant="primary"
          disabled={highlighted === null}
        />
      </View>
    </BottomSheet>
  );
}

type ProposalRowProps = {
  leaf: CategoryTreeNode;
  confidence: number;
  onPick: (categoryId: string) => void;
};

/**
 * Amber only below the §14 threshold. `design-system/02` reserves amber for
 * P4 — asserted or aged rather than observed — and a proposal that clears
 * 0.85 is not that; it is good news, and takes the same accent green as
 * every other confirmed pick in this sheet (`Chip`'s `selected`,
 * `RadioGroup`'s dot). Amber on a 93% match would teach "amber usually means
 * fine", which is the one thing P4 cannot afford to mean.
 */
function ProposalRow({ leaf, confidence, onPick }: ProposalRowProps) {
  const t = useT();
  const styles = useStyles();
  const confident = confidence >= PROPOSAL_DISPLAY_THRESHOLD;
  const percent = `${Math.round(confidence * 100)}%`;
  const handlePress = useCallback(() => onPick(leaf.id), [leaf.id, onPick]);
  const press = usePressScale();
  const { hovered, focused, handlers } = useInteraction();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.fieldValue", {
          field: t("categories.suggested"),
          value: leaf.name,
        })}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.proposal,
          confident ? styles.proposalConfident : styles.proposalLow,
          hovered ? styles.proposalHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text style={[styles.proposalKicker, confident ? styles.proposalKickerConfident : null]}>
          {t("categories.suggested")}
        </Text>
        <View style={styles.proposalBody}>
          <Text style={styles.proposalName}>{leaf.name}</Text>
          {confident ? (
            <Text style={styles.proposalPercentConfident}>{percent}</Text>
          ) : (
            <Tag variant="warn">{percent}</Tag>
          )}
        </View>
        {confident ? null : (
          <Text style={styles.lowConfidence}>{t("categories.lowConfidence")}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

type GroupChipProps = {
  id: string;
  name: string;
  selected: boolean;
  onPress: (id: string) => void;
};

/**
 * Narrows; never itself pickable (`TAXONOMY.md` R1) — a plain toggle button,
 * not a radio: unlike `Chip`'s account picker, tapping the chosen one again
 * clears the filter, which a radio cannot represent.
 */
function GroupChip({ id, name, selected, onPress }: GroupChipProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPress(id), [id, onPress]);
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityState={{ selected }}
        aria-pressed={selected}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.groupChip,
          selected ? styles.groupChipSelected : null,
          hovered && !selected ? styles.groupChipHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text style={[styles.groupChipText, selected ? styles.groupChipTextSelected : null]}>
          {name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

type LeafCellProps = {
  leaf: CategoryTreeNode;
  count: number | undefined;
  selected: boolean;
  onPress: (id: string) => void;
};

/** One cell of the two-column grid — `role="radio"` inside the grid's `radiogroup`. */
function LeafCell({ leaf, count, selected, onPress }: LeafCellProps) {
  const t = useT();
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const press = usePressScale();
  const handlePress = useCallback(() => onPress(leaf.id), [leaf.id, onPress]);
  const label =
    count === undefined
      ? leaf.name
      : t("common.fieldValue", { field: leaf.name, value: String(count) });
  return (
    <Animated.View style={[press.style, styles.cellWrap]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        onPress={handlePress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        {...handlers}
        style={[
          styles.cell,
          selected ? styles.cellSelected : null,
          hovered && !selected ? styles.cellHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text
          style={[styles.cellName, selected ? styles.cellNameSelected : null]}
          numberOfLines={1}
        >
          {leaf.name}
        </Text>
        {count === undefined ? null : <Text style={styles.cellCount}>{count}</Text>}
      </Pressable>
    </Animated.View>
  );
}

type UncategorizedRowProps = {
  leaf: CategoryTreeNode;
  count: number | undefined;
  selected: boolean;
  onPress: (id: string) => void;
};

/** Present, subordinate — last, below a rule, muted (S06 §9.2). */
function UncategorizedRow({ leaf, count, selected, onPress }: UncategorizedRowProps) {
  const styles = useStyles();
  const { hovered, focused, handlers } = useInteraction();
  const handlePress = useCallback(() => onPress(leaf.id), [leaf.id, onPress]);
  return (
    <View style={styles.uncategorizedDivider}>
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={leaf.name}
        accessibilityState={{ checked: selected }}
        aria-checked={selected}
        onPress={handlePress}
        {...handlers}
        style={[
          styles.uncategorizedRow,
          hovered ? styles.cellHovered : null,
          focused ? styles.focused : null,
        ]}
      >
        <Text style={styles.uncategorizedText}>{leaf.name}</Text>
        {count === undefined ? null : <Text style={styles.uncategorizedCount}>{count}</Text>}
      </Pressable>
    </View>
  );
}

type CreateRowProps = {
  groups: readonly CategoryTreeNode[];
  /** A group chip already narrowed the sheet — the row's group is locked, never re-chosen (S06 §6). */
  groupLocked: boolean;
  groupId: string | null;
  onGroupChange: (id: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  error: string | undefined;
  onCancel: () => void;
  onSave: () => void;
};

function CreateRow({
  groups,
  groupLocked,
  groupId,
  onGroupChange,
  name,
  onNameChange,
  error,
  onCancel,
  onSave,
}: CreateRowProps) {
  const t = useT();
  const styles = useStyles();
  const lockedGroup = groups.find((group) => group.id === groupId);
  const canSave = name.trim() !== "" && groupId !== null;
  return (
    <View style={styles.createRow}>
      {groupLocked ? null : (
        <>
          <Text style={styles.label}>{t("categories.chooseGroup")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {groups.map((group) => (
              <GroupChip
                key={group.id}
                id={group.id}
                name={group.name}
                selected={group.id === groupId}
                onPress={onGroupChange}
              />
            ))}
          </ScrollView>
        </>
      )}
      {groupLocked && lockedGroup ? <Text style={styles.label}>{lockedGroup.name}</Text> : null}
      <TextField
        label={t("common.name")}
        value={name}
        onChangeText={onNameChange}
        {...(error === undefined ? {} : { error })}
        autoFocus
      />
      <View style={styles.createActions}>
        <Button label={t("common.cancel")} onPress={onCancel} variant="ghost" />
        <Button label={t("common.save")} onPress={onSave} variant="primary" disabled={!canSave} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: theme.borderInteractive,
  },
  chipRow: { flexGrow: 0 },
  // Eight rows of leaves before the sheet scrolls internally — the same
  // "cap it at a token multiple" shape `select.tsx`'s `panelScroll` uses.
  gridScroll: { maxHeight: touchTarget.min * 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  noMatches: { color: theme.textMuted, ...text.ui("body"), textAlign: "center", padding: space.x5 },
  // Two columns (S06 §3: "leaves are short and groups are few") — `gap` on
  // the wrapping row does the column gutter, so each cell only needs to
  // clear just under half the row.
  cellWrap: { width: "48%" },
  cell: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.x2,
    paddingVertical: space.lg,
  },
  cellHovered: { backgroundColor: theme.hoverFill },
  cellSelected: { borderColor: theme.accentFillBorder, backgroundColor: theme.accentFill },
  cellName: { flex: 1, color: theme.text, ...text.ui("body") },
  cellNameSelected: { color: theme.accentText, ...text.ui("body", 600) },
  cellCount: { color: theme.textMuted, ...text.ui("caption") },
  focused: {
    outlineWidth: focus.width,
    outlineColor: theme.focusRing,
    outlineOffset: focus.offset,
  },
  groupChip: {
    minHeight: touchTarget.min,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.borderInteractive,
    borderRadius: radius.sm,
    paddingHorizontal: space.x3,
    marginRight: space.md,
  },
  groupChipHovered: { backgroundColor: theme.hoverFill },
  groupChipSelected: { borderColor: theme.accentFillBorder, backgroundColor: theme.accentFill },
  groupChipText: { color: theme.text, ...text.ui("body") },
  groupChipTextSelected: { color: theme.accentText, ...text.ui("body", 600) },
  uncategorizedDivider: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: space.x3,
    paddingTop: space.x3,
  },
  uncategorizedRow: {
    minHeight: touchTarget.min,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.x2,
  },
  uncategorizedText: { color: theme.textMuted, ...text.ui("body") },
  uncategorizedCount: { color: theme.textMuted, ...text.ui("caption") },
  proposal: {
    gap: space.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.x3,
  },
  /** ≥ 0.85 — a confirmed match, the same accent green every other pick uses. */
  proposalConfident: { borderColor: theme.accentFillBorder, backgroundColor: theme.accentFill },
  /**
   * < 0.85 — P4's amber marks the proposal itself (the caption's amber text,
   * and the confidence `Tag`'s own `warn` fill, `assertedFill`). The container
   * took that same token for its own background, so the "60%" badge sat on a
   * fill indistinguishable from its own. `subtleFill` (`#f1ebe0`) turned out to
   * be close enough to `assertedFill` (`#f4ecdf`) — both warm creams in this
   * palette — that the badge was still nearly invisible; `surface` (white)
   * is the container fill everywhere else a `Tag` sits on a card, and gives
   * the badge the contrast the amber border alone does not.
   */
  proposalLow: { borderColor: theme.assertedBorder, backgroundColor: theme.surface },
  proposalHovered: { backgroundColor: theme.hoverFill },
  proposalKicker: { color: theme.assertedText, ...text.ui("kicker") },
  proposalKickerConfident: { color: theme.accentText },
  proposalBody: { flexDirection: "row", alignItems: "center", gap: space.md },
  proposalName: { flex: 1, color: theme.text, ...text.ui("body", 600) },
  proposalPercentConfident: {
    color: theme.accentText,
    ...text.ui("tag"),
    textTransform: "uppercase",
  },
  lowConfidence: { color: theme.textMuted, ...text.ui("caption") },
  label: { color: theme.textMuted, ...text.ui("kicker") },
  createRow: {
    gap: space.x3,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: space.x3,
  },
  createActions: { flexDirection: "row", justifyContent: "flex-end", gap: space.xl },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.x3,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    paddingTop: space.x3,
  },
}));
