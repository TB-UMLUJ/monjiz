
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// 1. Supabase Config
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sgaxbwafynrrluyrdfia.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// 2. VAPID Keys (تم وضع المفاتيح التي تم توليدها)
const publicVapidKey = 'BM3q7_7Voea6BFYVbO26dS4ozYgvzCMIzmS0m2G5bOc0f2b6uaWsaRZRvtVnSwTHdE2QM1fzlfx7z1rg8T8Xtkk';
const privateVapidKey = '4FjoA3TKr72-NIPwVPjcfH-QeoJUrqocCLWcLzEGBfw'; 

if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Error: Missing SUPABASE_SERVICE_ROLE_KEY environment variable (Required for DB access).");
    console.error("Run: export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key");
    process.exit(1);
}

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Setup Web Push
webpush.setVapidDetails(
  'mailto:admin@mowaamah.app',
  publicVapidKey,
  privateVapidKey
);

async function sendNotifications() {
    console.log("Fetching subscriptions...");

    const { data: subscriptions, error } = await supabase
        .from('push_subscriptions')
        .select('*');

    if (error) {
        console.error("Database Error:", error);
        return;
    }

    console.log(`Found ${subscriptions.length} subscriptions.`);

    const payload = JSON.stringify({
        title: "تنبيه جديد 🚀",
        body: "وصلتك رسالة من Mowaamah عبر Supabase",
        icon: "https://cdn-icons-png.flaticon.com/512/2382/2382461.png"
    });

    for (const sub of subscriptions) {
        // التحقق من صحة الاشتراك قبل الإرسال
        if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
            console.warn(`Skipping invalid subscription ID: ${sub.id}`);
            continue;
        }

        const pushSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth
            }
        };

        try {
            await webpush.sendNotification(pushSubscription, payload);
            console.log(`Notification sent to ${sub.id}`);
        } catch (err) {
            console.error(`Error sending to ${sub.id}:`, err);
            if (err.statusCode === 410 || err.statusCode === 404) {
                // Subscription is invalid/expired, remove it
                await supabase.from('push_subscriptions').delete().eq('id', sub.id);
                console.log(`Removed invalid subscription: ${sub.id}`);
            }
        }
    }
}

sendNotifications();
