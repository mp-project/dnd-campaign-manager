<script setup lang="ts" generic="Row extends Record<string, unknown>">
/**
 * One data source, two views: a compact table on desktop and full-width records on mobile.
 * - `columns`: key, label, `sortable`, cell `class`, `width`. Sorting happens on the server: a
 *   sortable header switches `v-model:sort` ({ key, direction }), the page loads the rows again.
 * - Slots: `cell-<key>` ({ row }) for a desktop cell, `mobile` ({ row }) for a mobile record
 *   (without it, label and value of every column), `actions` ({ row }) at the end of a row,
 *   `empty` when there are no rows.
 * - `rowTo(row)` makes the row clickable as a shortcut; keep a real link in the row (e.g. the
 *   name) for the keyboard. Clicks on buttons, links and fields inside stay theirs.
 */
import { type RouteLocationRaw, useRouter } from "vue-router";

import Icon from "@/components/base/Icon.vue";
import { useAppI18n } from "@/core/i18n";

export type TableColumn = { key: string; label: string; sortable?: boolean; class?: string; width?: string };
export type TableSort = { key: string; direction: "asc" | "desc" } | null;

const sort = defineModel<TableSort>("sort", { default: null });
const props = withDefaults(
  defineProps<{
    columns: TableColumn[];
    rows: Row[];
    rowKey?: string;
    rowTo?: (row: Row) => RouteLocationRaw;
    caption?: string;
    emptyText?: string;
  }>(),
  { rowKey: "id", rowTo: undefined, caption: undefined, emptyText: undefined },
);
defineSlots<
  { [key: `cell-${string}`]: (props: { row: Row }) => unknown } & {
    mobile?(props: { row: Row }): unknown;
    actions?(props: { row: Row }): unknown;
    empty?(): unknown;
  }
>();
const { t } = useAppI18n();
const router = useRouter();

function keyOf(row: Row): string {
  return String(row[props.rowKey]);
}

function open(row: Row, event: MouseEvent): void {
  if (!props.rowTo || (event.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
  void router.push(props.rowTo(row));
}

function sortBy(column: TableColumn): void {
  sort.value =
    sort.value?.key === column.key
      ? { key: column.key, direction: sort.value.direction === "asc" ? "desc" : "asc" }
      : { key: column.key, direction: "asc" };
}

function ariaSort(column: TableColumn): "ascending" | "descending" | "none" | undefined {
  if (!column.sortable) return undefined;
  if (sort.value?.key !== column.key) return "none";
  return sort.value.direction === "asc" ? "ascending" : "descending";
}
</script>

<template>
  <div>
    <p
      v-if="rows.length === 0"
      class="rounded-card border border-line bg-parchment-card/70 px-4 py-6 text-center text-ink-2"
    >
      <slot name="empty">
        {{ emptyText ?? t("common.states.empty") }}
      </slot>
    </p>
    <template v-else>
      <div class="scroll-thin-light relative hidden overflow-x-auto rounded-card border border-line bg-parchment-card/70 md:block">
        <table class="table">
          <caption
            v-if="caption"
            class="sr-only"
          >
            {{ caption }}
          </caption>
          <thead>
            <tr>
              <th
                v-for="column in columns"
                :key="column.key"
                scope="col"
                :class="column.class"
                :style="column.width ? { width: column.width } : undefined"
                :aria-sort="ariaSort(column)"
              >
                <button
                  v-if="column.sortable"
                  type="button"
                  class="inline-flex items-center gap-1.5 font-semibold"
                  @click="sortBy(column)"
                >
                  {{ column.label }}
                  <Icon
                    :name="sort?.key === column.key ? (sort.direction === 'asc' ? 'ui-chevron-up' : 'ui-chevron-down') : 'ui-sort'"
                    :size="15"
                  />
                </button>
                <template v-else>
                  {{ column.label }}
                </template>
              </th>
              <th
                v-if="$slots.actions"
                scope="col"
                class="w-14"
              >
                <span class="sr-only">{{ t("common.list.actions") }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="keyOf(row)"
              :class="rowTo && 'cursor-pointer'"
              @click="open(row, $event)"
            >
              <td
                v-for="column in columns"
                :key="column.key"
                :class="column.class"
              >
                <slot
                  :name="`cell-${column.key}`"
                  :row="row"
                >
                  {{ row[column.key] }}
                </slot>
              </td>
              <td
                v-if="$slots.actions"
                class="text-right"
              >
                <slot
                  name="actions"
                  :row="row"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ul class="-mx-4 border-t border-line md:hidden">
        <li
          v-for="row in rows"
          :key="keyOf(row)"
          class="border-b border-line px-4 py-3.5"
          :class="rowTo && 'cursor-pointer active:bg-parchment-sunk'"
          @click="open(row, $event)"
        >
          <slot
            name="mobile"
            :row="row"
          >
            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              <template
                v-for="column in columns"
                :key="column.key"
              >
                <dt class="meta">
                  {{ column.label }}
                </dt>
                <dd>
                  <slot
                    :name="`cell-${column.key}`"
                    :row="row"
                  >
                    {{ row[column.key] }}
                  </slot>
                </dd>
              </template>
            </dl>
          </slot>
          <div
            v-if="$slots.actions"
            class="mt-2 flex justify-end"
          >
            <slot
              name="actions"
              :row="row"
            />
          </div>
        </li>
      </ul>
    </template>
  </div>
</template>
