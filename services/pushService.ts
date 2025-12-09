import { supabase, DEFAULT_USER_ID } from './supabaseClient';

// تم تحديث المفتاح العام (Public Key) بناءً على ما تم توليده
const VAPID_PUBLIC_KEY = 'BM3q7_7Voea6BFYVbO26dS4ozYgvzCMIzmS0m2G5bOc0f2b6uaWsaRZRvtVnSwTHdE2QM1fzlfx7z1rg8T8Xtkk'; 

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const pushService = {
  subscribeUser: async (iconUrl?: string) => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push messaging is not supported');
    }

    // 1. Check/Request Permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // 2. Subscribe
    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
    }

    // 3. Save to Supabase
    const subJson = subscription.toJSON();
    
    const { error } = await supabase
      .from('push_subscriptions')
      .insert({
        user_id: DEFAULT_USER_ID,
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        icon_url: iconUrl
      });

    if (error) {
      console.error("Supabase Save Error:", error);
      throw error;
    }

    // 4. Local Test Notification
    new Notification("تم تفعيل الإشعارات بنجاح", {
        body: "ستصلك تنبيهات منجز هنا.",
        icon: iconUrl || "/icon.png"
    });

    return true;
  }
};