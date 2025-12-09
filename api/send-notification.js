import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// --- CONFIGURATION ---
// 1. Supabase Config
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sgaxbwafynrrluyrdfia.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; 

// 2. VAPID Keys (مفاتيحك التي قمت بتوليدها)
const publicVapidKey = 'BM3q7_7Voea6BFYVbO26dS4ozYgvzCMIzmS0m2G5bOc0f2b6uaWsaRZRvtVnSwTHdE2QM1fzlfx7z1rg8T8Xtkk';
const privateVapidKey = '4FjoA3TKr72-NIPwVPjcfH-QeoJUrqocCLWcLzEGBfw'; 

// Initialize Web Push
webpush.setVapidDetails(
  'mailto:admin@monjez.app',
  publicVapidKey,
  privateVapidKey
);

export default async function handler(req, res) {
    // 1. Check for Service Role Key (Security)
    if (!SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ 
            error: 'Configuration Error', 
            details: 'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. Add it in Vercel Settings.' 
        });
    }

    // Initialize Supabase Admin Client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    try {
        console.log("Fetching subscriptions...");
        const { data: subscriptions, error } = await supabase
            .from('push_subscriptions')
            .select('*');

        if (error) throw error;

        console.log(`Found ${subscriptions.length} subscriptions.`);

        // Prepare Notification Payload
        const notificationPayload = JSON.stringify({
            title: req.body?.title || "تنبيه تجريبي 🚀",
            body: req.body?.body || "هذا إشعار تجريبي من سيرفر Vercel",
            icon: "https://cdn-icons-png.flaticon.com/512/2382/2382461.png"
        });

        const results = [];

        // Send to all subscribers
        await Promise.all(subscriptions.map(async (sub) => {
            if (!sub.endpoint || !sub.keys) return;

            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.keys.p256dh,
                    auth: sub.keys.auth
                }
            };

            try {
                await webpush.sendNotification(pushSubscription, notificationPayload);
                results.push({ id: sub.id, status: 'sent' });
            } catch (err) {
                console.error(`Error sending to ${sub.id}:`, err);
                if (err.statusCode === 410 || err.statusCode === 404) {
                    // Subscription expired, delete from DB
                    await supabase.from('push_subscriptions').delete().eq('id', sub.id);
                    results.push({ id: sub.id, status: 'deleted (expired)' });
                } else {
                    results.push({ id: sub.id, status: 'failed', error: err.message });
                }
            }
        }));

        res.status(200).json({ success: true, results });

    } catch (error) {
        console.error("Serverless Function Error:", error);
        res.status(500).json({ error: error.message });
    }
}