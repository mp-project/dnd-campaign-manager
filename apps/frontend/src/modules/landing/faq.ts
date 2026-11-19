import type { IconName } from "@/components/base/iconNames";
import type { MessageKey } from "@/core/i18n/keys";

/** Where an answer leads on: another page of the site or, for the demo, its own address. */
export type FaqLink = "demo" | "register" | "privacy";

export type FaqQuestion = { id: string; question: MessageKey; answer: MessageKey; links?: readonly FaqLink[] };
export type FaqGroup = { id: string; icon: IconName; title: MessageKey; hint: MessageKey; questions: readonly FaqQuestion[] };

const question = (id: string, links?: readonly FaqLink[]): FaqQuestion => ({
  id,
  // i18n-dynamic: landing.faq.questions.*
  question: `landing.faq.questions.${id}.question` as MessageKey,
  answer: `landing.faq.questions.${id}.answer` as MessageKey,
  ...(links ? { links } : {}),
});

const group = (id: string, icon: IconName, questions: FaqQuestion[]): FaqGroup => ({
  id,
  icon,
  // i18n-dynamic: landing.faq.groups.*
  title: `landing.faq.groups.${id}.title` as MessageKey,
  hint: `landing.faq.groups.${id}.hint` as MessageKey,
  questions,
});

/**
 * The questions of the FAQ page in reading order, grouped by topic. Ids are part of the address
 * (`/faq#faq-<id>` opens a question), so they stay when the wording changes.
 */
export const FAQ_GROUPS: readonly FaqGroup[] = [
  group("basics", "orig-buch", [
    question("what"),
    question("audience"),
    question("rules"),
    question("demo", ["demo", "register"]),
    question("languages"),
  ]),
  group("campaign", "nav-kampagne", [
    question("world"),
    question("invite"),
    question("roles"),
    question("visibility"),
    question("homebrew"),
  ]),
  group("table", "orig-wuerfel", [
    question("creation", ["register"]),
    question("characters"),
    question("sessions"),
    question("mobile"),
    question("history"),
    question("media"),
  ]),
  group("account", "ui-shield", [question("signIn", ["register"]), question("devices"), question("privacy", ["privacy"]), question("motion")]),
];

/** Element id of a question (its address is `#<id>`) and of a topic's heading. */
export const faqQuestionId = (id: string) => `faq-${id}`;
export const faqTopicId = (id: string) => `faq-topic-${id}`;

/** Lower case without accents, so "uberall" finds "überall". */
export function searchable(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** The questions whose question or answer contains every word of the query. */
export function matchingQuestions(
  groups: readonly FaqGroup[],
  query: string,
  text: (key: MessageKey) => string,
): Set<string> {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  const all = groups.flatMap((entry) => entry.questions);
  if (words.length === 0) return new Set(all.map((entry) => entry.id));
  return new Set(
    all
      .filter((entry) => {
        const haystack = searchable(`${text(entry.question)} ${text(entry.answer)}`);
        return words.every((word) => haystack.includes(word));
      })
      .map((entry) => entry.id),
  );
}

/**
 * JSON-LD of the page: the questions as `FAQPage` (the answers as shown, without the links below
 * them) and the way there as `BreadcrumbList`. `home` and `page` are absolute addresses.
 */
export function faqStructuredData(options: {
  groups: readonly FaqGroup[];
  text: (key: MessageKey) => string;
  locale: string;
  home: { name: string; url: string };
  page: { name: string; url: string };
}): object[] {
  const { groups, text, locale, home, page } = options;
  return [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${page.url}#faq`,
      url: page.url,
      name: page.name,
      inLanguage: locale,
      mainEntity: groups.flatMap((entry) =>
        entry.questions.map((item) => ({
          "@type": "Question",
          name: text(item.question),
          acceptedAnswer: { "@type": "Answer", text: text(item.answer) },
        })),
      ),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: home.name, item: home.url },
        { "@type": "ListItem", position: 2, name: page.name, item: page.url },
      ],
    },
  ];
}
