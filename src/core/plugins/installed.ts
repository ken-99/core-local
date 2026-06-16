// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2025 Collab Digital Twins

import type { PluginEntry, PluginManifest } from './sdk/types'
import * as shipTraffic from './ship-traffic'
import shipTrafficManifest from './ship-traffic/manifest.json'

/**
 * The plugins this app runs, in load order.
 *
 * To add a plugin: import its manifest and entry, then append a new entry.
 * To disable a plugin: comment out or remove its entry.
 */
export const INSTALLED_PLUGINS: Array<{
  manifest: PluginManifest
  entry: PluginEntry
}> = [
  {
    manifest: shipTrafficManifest as PluginManifest,
    entry: shipTraffic,
  },
]
