# Deploy ORBIT DJ

## Current setup: GitHub Pages (from 2026-11-18)
The live app is **https://cgrouwinkel.github.io/orbit-dj/**, served straight from the `main` branch of `cgrouwinkel/orbit-dj`. Pushing to `main` redeploys automatically in about a minute; there's no ZIP to upload. Check **Setup** → bottom line for the version number. If the Home Screen app shows "New version ready", tap it when you're not mid-set.

The old Netlify site (g-bit.netlify.app) still runs v1 unless you upload a ZIP there. The steps below are kept for that route.

## Alternative: Netlify from your iPhone

You need: `ORBIT-DJ-v2.1.0-netlify.zip` and your Netlify login. No computer, Xcode or paid plan.

1. **Save the ZIP to Files.** Tap the ZIP in the chat, then use the Share button and choose **Save to Files** (Downloads or iCloud Drive). Don't unzip it.
2. **Open your site in Netlify.** In Safari go to app.netlify.com, log in, and open the project for **g-bit.netlify.app**.
3. **Open Deploys.** Go to the **Deploys** tab and scroll to the bottom, to the dashed "drag and drop" box.
4. **Upload.** Tap the box (or "browse to upload"), choose **Browse**, then pick `ORBIT-DJ-v2.1.0-netlify.zip`.
5. **Wait for "Published".** Manual deploys usually finish in under a minute and show no build log (normal for manual uploads).
6. **Check the version.** Open https://g-bit.netlify.app/, go to **Setup**, scroll to the bottom and confirm **ORBIT DJ v2.1.0**. If you still see the old page, pull to refresh once.
7. **Install it.** In Safari tap **Share → Add to Home Screen**, then open ORBIT from the Home Screen and turn the phone sideways.

**If the drop box won't accept the ZIP on your phone:** Netlify's docs describe both folder and ZIP uploads, and iPhone Safari can't pick a folder. Use whichever route worked for your last deploy, or ask Claude for another path. Don't use a work-managed device to get around this.

**Roll back:** In Deploys, tap an older deploy, then **Publish deploy**.

**Updates:** if v2.0.0 is already installed on your phone, the app shows "New version ready. Tap to update." after the upload. Tap it when you're not mid-set. The ZIP is about 5.5 MB because of the new sound library.

## First 5-minute check on the phone
1. Flip the silent switch **on**, then tap **Play your first groove**. You should hear music.
2. With AirPods or other Bluetooth headphones: **Setup → Tap test**, then play a set and check hits say ON THE BEAT rather than consistently LATE.
3. During a set, swipe home and come back. The set should be paused, and RESUME should continue in time.
4. During a set, trigger Siri or an alarm. A "Sound paused" sheet should appear; tap it to resume.
5. Play all four lane pads with four fingers at once. Then open **Beats**, press **PLAY**, then **REC**, and tap a few pads. Your hits should loop on the next bar. Try **NOTE RPT** while holding a pad, and **FILE → Bounce WAV**.
6. Switch themes mid-set (Setup → Look). The music must not stop.
7. Turn on Airplane Mode and reopen the Home Screen app. It should still load.
