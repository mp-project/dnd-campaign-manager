/**
 * The one import of GSAP. Registers the plugins the app uses once and turns the motion tokens into
 * eases, so a tween with `ease: motionEase("out")` moves like the CSS transitions. Modules import
 * GSAP from here only, and only from code that loads with their route, so GSAP stays out of the
 * app's start bundle.
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { type MotionEase, motionBezier, motionDuration } from "./tokens";

gsap.registerPlugin(ScrollTrigger, CustomEase);

/** GSAP's nearest curve, where a token is missing (tests without CSS). */
const FALLBACK_EASES: Record<MotionEase, string> = {
  standard: "power1.inOut",
  out: "power3.out",
  "in-out": "power2.inOut",
  spring: "back.out(1.6)",
};

const eases = new Map<MotionEase, string>();

/** The ease of a motion token (`--motion-ease-<name>`). */
export function motionEase(name: MotionEase): string {
  let ease = eases.get(name);
  if (!ease) {
    const points = motionBezier(name);
    ease = points ? `motion-${name}` : FALLBACK_EASES[name];
    if (points) CustomEase.create(ease, points.join(","));
    eases.set(name, ease);
  }
  return ease;
}

gsap.defaults({ duration: motionDuration("base"), ease: motionEase("out") });

export { gsap, ScrollTrigger };
export { motionDuration } from "./tokens";
