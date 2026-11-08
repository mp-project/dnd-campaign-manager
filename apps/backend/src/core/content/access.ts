/**
 * Why content is read; the content kernel decides by purpose, never the module.
 *
 * - `READ`: one asset or the ends of links and usages. The full view sees all content of the
 *   campaign and global content offered to it (administrators: all global content).
 * - `CATALOG`: what the campaign may use. Global drafts and global content of other rulesets are
 *   never offered, also not to administrators; archived content only while the campaign uses it.
 * - `MANAGE`: the campaign's own content, as its management routes show it: the full view gets
 *   all of it, archived included; players what `READ` shows them of it.
 *
 * Players never see drafts; they see active content granted to them (global content of the
 * campaign ruleset, shares, releases) and archived content the campaign still uses.
 */
export type ContentReadPurpose = "READ" | "CATALOG" | "MANAGE";
