/** Filesystem locations this plugin owns. */
import { homedir } from 'node:os'
import { join } from 'node:path'

/** The DSH home the running Host uses. */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv
  return join(homedir(), '.dsh')
}

/** Private storage for the ledger, pricing overrides, and backfill state. */
export function dataDir() {
  return join(dshHome(), 'storages', 'dsh-usage-insights')
}

/** Durable session logs, one directory per workspace. */
export function sessionsDir() {
  return join(dshHome(), 'sessions')
}
