/**
 * Clerk's sign-in, registration, waitlist and account components in the app's look. Clerk puts its
 * own styles into the CSS layer `clerk`, which `main.css` orders below the app's components and
 * utilities, so the elements below simply take the app's classes: fields are `.input`, the main
 * button `.btn-primary`, provider buttons `.btn-secondary`, labels `.label`, colours the theme
 * utilities. The page's parchment card (`BrandLayout`) is the frame; Clerk's own card loses border,
 * shadow and background (no card in a card) and takes the full width, so the form sits centred.
 * Variables cover what the classes don't reach (Clerk's computed shades, icons, focus rings).
 */
export const clerkAppearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "var(--color-primary)",
    colorPrimaryForeground: "var(--color-parchment-card)",
    colorDanger: "var(--color-danger)",
    colorSuccess: "var(--color-ok)",
    colorBackground: "var(--color-parchment-card)",
    colorForeground: "var(--color-ink)",
    colorMutedForeground: "var(--color-ink-3)",
    colorMuted: "var(--color-parchment-sunk)",
    colorInput: "var(--color-parchment-card)",
    colorInputForeground: "var(--color-ink)",
    colorNeutral: "var(--color-ink)",
    colorBorder: "var(--color-line-strong)",
    colorRing: "var(--color-primary)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontSize: "16px",
    borderRadius: "var(--radius-control)",
  },
  elements: {
    rootBox: "flex w-full justify-center",
    cardBox: "w-full max-w-none overflow-visible rounded-none border-0 bg-transparent shadow-none",
    card: "gap-6 overflow-visible border-0 bg-transparent p-1 shadow-none",
    headerTitle: "section-title",
    headerSubtitle: "text-[15px] text-ink-2",

    socialButtonsBlockButton: "btn btn-secondary w-full shadow-none",
    socialButtonsBlockButtonText: "font-medium text-ink",
    socialButtonsIconButton: "btn btn-secondary shadow-none",
    dividerLine: "bg-line",
    dividerText: "text-sm text-ink-3",

    formFieldLabel: "label",
    formFieldInput: "input shadow-none",
    formFieldInputShowPasswordButton: "text-ink-3 hover:text-ink",
    formFieldHintText: "text-sm text-ink-3",
    formFieldErrorText: "text-sm text-danger",
    formFieldAction: "text-sm font-medium text-primary hover:text-primary-hover",
    formFieldCheckboxLabel: "text-[15px] text-ink-2",
    otpCodeFieldInput: "rounded-control border border-line-strong bg-parchment-card text-ink shadow-none",
    formButtonPrimary: "btn btn-primary w-full normal-case",
    formButtonReset: "btn btn-ghost shadow-none",
    formResendCodeLink: "font-medium text-primary hover:text-primary-hover",
    alternativeMethodsBlockButton: "btn btn-secondary w-full shadow-none",
    backLink: "font-medium text-primary hover:text-primary-hover",
    buttonArrowIcon: "hidden",

    identityPreview: "rounded-control border border-line bg-parchment-sunk shadow-none",
    identityPreviewEditButton: "text-primary hover:text-primary-hover",
    alertText: "text-ink",

    footer: "bg-transparent bg-none",
    footerActionText: "text-[15px] text-ink-2",
    footerActionLink: "font-medium text-primary underline underline-offset-4 hover:text-primary-hover",
    footerPagesLink: "text-ink-3 hover:text-ink",

    // The account view inside the app's page: no extra frame around it either.
    navbar: "bg-transparent",
    scrollBox: "border-0 bg-transparent shadow-none",
  },
} as const;
