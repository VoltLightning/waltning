/**
 * Review — the approval surface. `design-system/05` §5.3.
 *
 * A domain the §-headings do not name, and the one `DiffCard` needs: §5.3 calls
 * it "one component, three call sites (agent, voice, receipt)", so filing it
 * under any of the three recreates the three variants P3 exists to prevent.
 * What it actually renders is a registry operation's before and after, which is
 * its own concept.
 *
 * `Pill` starts here because §3.4 defines it as *import review's* row-level
 * provenance marker — `Rule · <name>` and `Model 0.91` are review vocabulary,
 * not primitive shapes. `DiffCard`, `ToolResultCard`, `ImportRow`, `AuditRow`
 * and the rest of §5.3 follow.
 */

export { Pill, type PillTier } from "./pill";
