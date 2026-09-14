/**
 * Grouping for the chat model picker: models are offered under the upstream
 * channel that serves them, so choosing a model also chooses its channel.
 *
 * Two rules matter and are easy to get wrong:
 * - the same model name can be served by several channels, but a picker item
 *   value must be unique (Radix rejects duplicates and the rest of the page
 *   stores plain model names), so each name is claimed by the first group that
 *   offers it;
 * - the selected channel's group comes first, which is also what makes its copy
 *   of a shared model name the reachable one.
 */

export interface ChannelModelGroup {
  id: number;
  name: string;
  models: string[];
}

export interface CatalogChannel {
  id: number;
  name: string;
  models: string[];
}

/** Orders channels for display: the selected one first, then by name. */
export function orderCatalogChannels<T extends { id: number; name: string }>(channels: T[], selectedChannelID: number): T[] {
  return [...channels].sort((left, right) => {
    if (left.id === selectedChannelID) return -1;
    if (right.id === selectedChannelID) return 1;
    return String(left.name).localeCompare(String(right.name));
  });
}

/**
 * Builds the picker groups from the user catalog. `activeModel` is kept
 * selectable even when no channel advertises it (an agent or a saved session can
 * name a model the catalog no longer lists).
 */
export function groupModelsByChannel(
  catalog: CatalogChannel[],
  selectedChannelID: number,
  activeModel: string,
): ChannelModelGroup[] {
  const claimed = new Set<string>();
  const groups: ChannelModelGroup[] = orderCatalogChannels(catalog, selectedChannelID)
    .map((channel) => {
      const models: string[] = [];
      for (const value of channel.models) {
        const model = String(value ?? "").trim();
        if (!model || claimed.has(model)) {
          continue;
        }
        claimed.add(model);
        models.push(model);
      }
      return { id: channel.id, name: channel.name, models };
    })
    .filter((group) => group.models.length > 0);

  // A model no channel advertises still has to stay selectable (an agent or a
  // saved session can name one), but it belongs to no channel, so its group
  // carries no label — labelling it with a channel would claim it serves it.
  if (activeModel && !claimed.has(activeModel)) {
    groups.unshift({ id: 0, name: "", models: [activeModel] });
  }
  return groups;
}

/** The channel that offers `model`, or 0 when no group does. */
export function channelIDForModel(groups: ChannelModelGroup[], model: string): number {
  return groups.find((group) => group.models.includes(model))?.id ?? 0;
}
