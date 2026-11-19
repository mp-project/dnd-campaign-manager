/**
 * jsdom has no `matchMedia`; GSAP's ScrollTrigger needs one when it registers. No query matches,
 * like a desktop browser without reduced motion. Tests stub their own where it matters.
 */
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
