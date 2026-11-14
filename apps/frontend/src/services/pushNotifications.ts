// Pusher Beams web push. The SDK comes from the CDN script tag in index.html,
// the service worker from public/service-worker.js (served at /service-worker.js).

interface BeamsClient {
  start(): Promise<BeamsClient>;
  addDeviceInterest(interest: string): Promise<void>;
}

declare global {
  interface Window {
    PusherPushNotifications?: {
      Client: new (options: { instanceId: string }) => BeamsClient;
    };
  }
}

export async function startPushNotifications(): Promise<void> {
  const instanceId = import.meta.env.VITE_PUSHER_BEAMS_INSTANCE_ID as string | undefined;
  const sdk = window.PusherPushNotifications;

  // Beams is optional: without an instance id the app runs without push notifications.
  if (!instanceId) {
    return;
  }
  if (!sdk) {
    console.warn("Pusher Beams: SDK script not loaded");
    return;
  }
  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    console.warn("Pusher Beams: service workers unavailable (secure context required)");
    return;
  }
  if ("Notification" in window && Notification.permission === "denied") {
    console.warn("Pusher Beams: notifications are blocked for this site in the browser settings");
    return;
  }

  try {
    const beamsClient = new sdk.Client({ instanceId });
    await beamsClient.start();
    await beamsClient.addDeviceInterest("hello");
  } catch (error) {
    console.error("Pusher Beams: registration failed", error);
  }
}
