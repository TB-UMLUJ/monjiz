
import { supabase, DEFAULT_USER_ID } from './supabaseClient';

// Public Key generated via web-push
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

    console.log('Requesting notification permission...');
    // 1. Check/Request Permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    // 2. Ensure Service Worker is Ready (with timeout fallback)
    console.log('Waiting for Service Worker ready...');
    
    // Explicitly register if not present (just in case index.html failed)
    if (!navigator.serviceWorker.controller) {
        await navigator.serviceWorker.register('/service-worker.js');
    }

    // Use a race condition to prevent hanging indefinitely
    const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<ServiceWorkerRegistration>((_, reject) => 
            setTimeout(() => reject(new Error('Service Worker took too long to be ready')), 5000)
        )
    ]);
    
    console.log('Service Worker is ready:', registration);

    // 3. Subscribe
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
        console.log('No existing subscription, subscribing now...');
        const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
    } else {
        console.log('Found existing subscription.');
    }

    // 4. Save to Supabase (Manual Check instead of Upsert to avoid Constraint Error)
    console.log('Saving subscription to database...');
    const subJson = subscription.toJSON();
    
    // Check if endpoint is valid
    if (!subJson.endpoint) {
        throw new Error('Invalid subscription endpoint generated');
    }

    // FIX: Do not use upsert because "endpoint" column might not have a UNIQUE constraint yet.
    // Instead, SELECT then INSERT/UPDATE.

    // Step A: Check if exists
    const { data: existing, error: fetchError } = await supabase
        .from('push_subscriptions')
        .select('id')
        .eq('endpoint', subJson.endpoint)
        .maybeSingle();

    if (fetchError) {
        console.error("Error checking subscription:", fetchError);
        // Continue to try insert if fetch failed, or throw? better to throw to be safe
    }

    let error;
    
    if (existing) {
        // Step B: Update existing
        console.log('Updating existing subscription...');
        const { error: updateError } = await supabase
            .from('push_subscriptions')
            .update({
                user_id: DEFAULT_USER_ID,
                keys: subJson.keys,
                icon_url: iconUrl,
                // Don't update created_at
            })
            .eq('id', existing.id);
        error = updateError;
    } else {
        // Step C: Insert new
        console.log('Inserting new subscription...');
        const { error: insertError } = await supabase
            .from('push_subscriptions')
            .insert({
                user_id: DEFAULT_USER_ID,
                endpoint: subJson.endpoint,
                keys: subJson.keys,
                icon_url: iconUrl,
                created_at: new Date().toISOString()
            });
        error = insertError;
    }

    if (error) {
      console.error("Supabase Save Error:", error);
      throw new Error(`Database Error: ${error.message}`);
    }

    console.log('Subscription saved successfully.');

    // 5. Local Test Notification
    try {
        await registration.showNotification("تم تفعيل الإشعارات بنجاح", {
            body: "ستصلك تنبيهات منجز هنا.",
            icon: iconUrl || "https://cdn-icons-png.flaticon.com/512/2382/2382461.png",
            dir: 'rtl'
        });
    } catch (e) {
        console.warn('Could not show local notification:', e);
    }

    return true;
  }
};
