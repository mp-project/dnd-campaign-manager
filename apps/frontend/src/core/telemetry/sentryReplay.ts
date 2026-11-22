/** Session Replay in its own chunk: only visitors who allowed statistics download it. */
import { addIntegration, replayIntegration } from "@sentry/vue";

export function addReplay() {
  // Text and inputs masked, images and media blocked: the replay shows the layout, not the content.
  const replay = replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true });
  addIntegration(replay);
  return replay;
}
