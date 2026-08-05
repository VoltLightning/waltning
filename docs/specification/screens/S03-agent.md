# S03 · Agent

> Migrated from `FLOWS.md`. **Not yet expanded** — see the screen template.
> Visual design: exists in the Claude Design project

**Purpose** Answer what needs Excel today; perform bounded writes.
**Regions** Three columns — sessions · conversation · audit.
**Components** `ToolResultCard`, `DiffCard`, `AuditRow`.
**States** Idle · ⊗ thinking/streaming · tool running · awaiting approval ·
applied · declined · ⊗ refusal.
**Actions** Ask · approve · decline · ⊗ revert.
