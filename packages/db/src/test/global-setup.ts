/**
 * Runs once per test run, before any suite: migrate the template database.
 *
 * Doing it here rather than in a per-file hook means a broken migration fails
 * the run with one clear error instead of the same error in every file.
 */
import { createTemplate, dropTemplate } from "./scratch.ts";

export async function setup(): Promise<void> {
  await createTemplate();
}

export async function teardown(): Promise<void> {
  await dropTemplate();
}
