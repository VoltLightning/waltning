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
 * group id reaching `onPick`.
 *
 * **A root leaf is not the same thing as `Uncategorized`.** The seed puts one
 * leaf at the root and every seeded leaf under a group, but nothing refuses a
 * second root leaf — `create_category`'s `parentId` is nullable, and this
 * sheet's own create makes one whenever the taxonomy holds no group to name.
 * So the honest blank is identified by *what it is* (`isSeededUncategorized`
 * below), never by *where it sits*: matching the first root leaf handed the
 * Uncategorized row to whichever category was created first and put
 * `Uncategorized` itself in the grid, which is exactly the place §9.2 says it
 * never goes.
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
  /**
   * The seed's own tag (`seed:uncategorized`) — never rendered, carried only
   * so identifying the honest blank does not have to fall back to matching
   * by shape. `category-tree.tsx` carries the same field for the same
   * reason. Optional: `PhoneCategoryNode` does not set it yet (arc-phone has
   * no sync, so nothing writes an `externalId` on the phone's own rows), and
   * a fixture that does not care omits it.
   */
  externalId?: string | null;
};

/**
 * What the create-in-place row can save. `parentId: null` is a real answer —
 * the first category of a taxonomy with no group to put it under, the same
 * write S19's own create sheet makes (`TAXONOMY.md` R1 is about a node being
 * a group or a leaf, not about parents). With groups on the tree this sheet
 * asks which one.
 */
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

/**
 * **The seeded honest blank, by identity rather than by position.**
 * `categories-screen.tsx`'s own `isUncategorized` is this rule, and this is
 * the same two stages for the same reasons: the seed's tag first
 * (`packages/db/src/seed/run.ts` writes `seed:<key>`), which names the exact
 * row once sync carries `externalId` down to the replica; the whole seeded
 * *shape* second, which is what actually matches today, because arc-phone has
 * no sync and nothing sets an `externalId` on a phone's own categories.
 *
 * The shape has to be all four parts. Sibling uniqueness is `(parent, kind,
 * name)`, so an income leaf named "Uncategorized" is a legal, reachable row
 * that is **not** this one — matching on name and root alone would swallow it.
 * And `parentId === null && isLeaf` alone is not the blank at all any more:
 * this sheet creates root leaves whenever the taxonomy has no group, and the
 * first one created would otherwise take the blank's place.
 */
function isSeededUncategorized(node: CategoryTreeNode): boolean {
  if (node.externalId === "seed:uncategorized") return true;
  return (
    node.parentId === null &&
    node.kind === "expense" &&
    node.isLeaf &&
    node.name.trim().toLowerCase() === "uncategorized"
  );
}

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
  const uncategorized = useMemo(() => nodes.find(isSeededUncategorized), [nodes]);
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
    // `parentId: null` is legal exactly where there is no group to name —
    // the first category of an empty taxonomy. With groups on the tree the
    // sheet asks which one, so a null parent there is an unanswered
    // question rather than an answer.
    if (name === "" || (createGroupId === null && groups.length > 0)) return;
    const result = onCreate({ name, kind, parentId: createGroupId });
    if ("error" in result) {
      setCreateError(result.error);
      return;
    }
    setCreating(false);
    setCreateError(undefined);
    handlePick(result.id);
  }, [createGroupId, createName, groups.length, handlePick, kind, onCreate]);

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
  /**
   * **A groupless tree is not a dead end.** `create_category`'s own
   * `parentId` is nullable (`registry/inputs.ts`) and `TAXONOMY.md` R1 makes
   * a node a group *or* a leaf without saying anything about parents — the
   * seeded taxonomy itself holds a top-level leaf. So a ledger with no
   * groups creates its first category at the top level, the same write
   * `CreateCategorySheet` makes from S19; `convert_leaf_group` is what turns
   * it into a group afterwards.
   *
   * §6's *"never at top level"* is the **filtered** empty's own rule — its
   * `Create "…"` is scoped to the group that narrowed the sheet — and stays
   * that: `canCreateHere` below is what it governs.
   */
  const canCreate = onCreate !== undefined;
  const canCreateHere = canCreate && groupId !== null;
  /**
   * §6's *other* empty: a tree with no ordinary leaves, which is what a
   * fresh ledger is until the taxonomy arrives. It is not a filter that
   * excluded everything, so it says neither *Search 0 categories* (a count
   * of something nobody has) nor *Nothing matches* (which blames a query for
   * an absence that predates it). `searching` cannot be the test — a query
   * typed into an empty sheet still finds nothing, and the reason is still
   * that there is nothing.
   *
   * **`Uncategorized` does not make the tree non-empty.** It is the seeded
   * honest blank (§9.2) and renders in its own row below regardless; the
   * seeded shape of a fresh expense tree is *exactly* that leaf and no
   * others, so counting it here would hand that ledger "Search 0
   * categories" and "Nothing matches" — the two strings this state exists to
   * remove.
   */
  const emptyTree = ordinaryLeaves.length === 0;
  /**
   * The footer's own *New*, offered again from the empty state where a
   * person is actually reading — named in full there, because two controls
   * labelled *New* on one sheet is one button announced twice.
   */
  const createAction = canCreate
    ? {
        label: t("categories.createFirst"),
        // L12 — a query typed into an empty sheet is what the person wants
        // the category *called*; the filtered empty already prefills it, and
        // throwing it away here made the two states behave differently for
        // no reason a person could see.
        onPress: searching ? handleCreateFromEmpty : handleOpenCreate,
      }
    : undefined;

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
        placeholder={
          emptyTree
            ? t("categories.searchEmpty")
            : t("categories.search", { count: ordinaryLeaves.length })
        }
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
      {/*
        `nestedScrollEnabled` on the inner list — the bounded one
        (`gridScroll`'s own `maxHeight`) — never on the sheet body. Inert
        today: `BottomSheet`'s body is a plain `View` in a `Modal`, so there
        is no outer scrollable to lose the gesture to. It is the Android
        contract for the day that body scrolls, stated on the list it would
        be about.
      */}
      <ScrollView style={styles.gridScroll} nestedScrollEnabled>
        {visibleLeaves.length === 0 ? (
          emptyTree ? (
            createAction === undefined ? (
              // **A picker-only caller** (`onCreate` absent — S10's
              // categorize path). There is nothing here that can create, so
              // the copy offers nothing: an `EmptyState` requires an action,
              // and inviting one this sheet cannot perform is the promise
              // this state exists to avoid.
              <View style={styles.emptyTree}>
                <Text style={styles.emptyTreeTitle}>{t("categories.pickerEmptyTitle")}</Text>
                <Text style={styles.emptyTreeBody}>{t("categories.pickerEmptyReadOnlyBody")}</Text>
              </View>
            ) : (
              <EmptyState
                variant="first-run"
                title={t("categories.pickerEmptyTitle")}
                body={t("categories.pickerEmptyBody")}
                primaryAction={createAction}
              />
            )
          ) : canCreateHere ? (
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
        {/*
          Absent, not disabled, for a caller that passes no `onCreate`: a
          control that can never enable is chrome shaped like an offer, and
          the sheet already says in words that this one only picks.
        */}
        {canCreate ? (
          <Button label={t("categories.new")} onPress={handleOpenCreate} variant="secondary" />
        ) : (
          <View />
        )}
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
  // A top-level category is a real answer where no group exists (R1, and
  // `create_category`'s own nullable `parentId`); where groups do exist, the
  // capture sheet still asks which one — §6's own rule for creating here.
  const canSave = name.trim() !== "" && (groupId !== null || groups.length === 0);
  return (
    <View style={styles.createRow}>
      {groupLocked ? null : (
        <>
          {/*
            **No chooser where there is nothing to choose** —
            `CreateCategorySheet` (S19) states the same rule for the same
            control: a picker at rest looks identical whether it holds three
            groups or none, so the one state that needs explaining was the
            one that looked ordinary. The line says where the category will
            land instead.
          */}
          {groups.length === 0 ? (
            <Text style={styles.noGroups}>{t("categories.noGroupsYet")}</Text>
          ) : (
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
  /** `EmptyState`'s own shape, without the button it requires and this state cannot offer. */
  emptyTree: { alignItems: "center", gap: space.x3, padding: space.x6 },
  emptyTreeTitle: { color: theme.text, ...text.display("displayTwo") },
  emptyTreeBody: { color: theme.textMuted, ...text.ui("body"), textAlign: "center" },
  /** The create row's own note where the group chooser would be. */
  noGroups: { color: theme.textMuted, ...text.ui("bodySm") },
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
