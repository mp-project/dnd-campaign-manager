/**
 * JSON-LD of the start page: the site (`WebSite`), who runs it (`Organization`, without a logo
 * until the brand is settled) and the app itself (`SoftwareApplication`, a web app for
 * tabletop role-playing games). The three are linked by `@id`, so search engines read them as
 * one. `url` is the start page in its language, `site` the site's root.
 */
export function startPageStructuredData(options: {
  site: string;
  url: string;
  locale: string;
  name: string;
  description: string;
  languages: readonly string[];
  features: readonly string[];
}): object[] {
  const { site, url, locale, name, description, languages, features } = options;
  const organization = `${site}/#organization`;
  const website = `${site}/#website`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organization,
      name,
      url: `${site}/`,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": website,
      name,
      url,
      description,
      inLanguage: locale,
      publisher: { "@id": organization },
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": `${site}/#app`,
      name,
      url,
      description,
      applicationCategory: "GameApplication",
      applicationSubCategory: "Tabletop role-playing game campaign manager",
      operatingSystem: "Web",
      availableLanguage: languages,
      inLanguage: locale,
      featureList: features,
      publisher: { "@id": organization },
      isPartOf: { "@id": website },
    },
  ];
}
