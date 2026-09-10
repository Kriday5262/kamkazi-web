# Connecting your Google Calendar

Kamkazi can sync your Google (Workspace) calendar **read-only** — it never
writes, edits, or deletes events in Google. Because it uses OAuth (the same
method iOS Calendar and Fantastical use), it works even where public ICS
links and secret iCal addresses are blocked by your admin.

Follow these steps once (about 10 minutes):

1. **Open the Google Cloud Console** at https://console.cloud.google.com and sign in with the Google account whose calendar you want to sync (e.g. your office Workspace account).

2. **Create a project**: click the project picker at the top → **New Project** → name it `Kamkazi` → **Create**. Make sure it is selected in the picker afterwards.

3. **Enable the Calendar API**: in the search bar type `Google Calendar API` → click **Google Calendar API** → click **Enable**.

4. **Configure the consent screen**: go to **APIs & Services → OAuth consent screen** → choose **External** → **Create**. Fill in an app name (`Kamkazi`) and your email, save. Under **Audience / Test users**, click **Add users** and add your own Google email — while the app is in "testing", only test users can connect.

5. **Create the OAuth Client ID**: go to **APIs & Services → Credentials** → **+ Create credentials → OAuth client ID** → Application type **Web application**. Under **Authorized redirect URIs**, add exactly:

   `https://app.kamkazi.com/api/google/callback`

   Click **Create**.

6. **Copy the credentials**: a popup shows your **Client ID** and **Client secret**. Copy both (you can always reopen them from the Credentials list).

7. **Add them to Kamkazi**: open Kamkazi → **Settings → Calendar → Google Calendar → Connect Google Calendar**. If you are not taken straight to a Google sign-in page, first paste the Client ID and Secret (append them to the connect URL when prompted, or add them to the `.env` file on the server as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` and restart the app).

8. **Consent**: on the Google page, choose your office account. If you see "Google hasn't verified this app", click **Continue** (it's your own app). Tick the calendar read permission and **Allow**.

9. **Pick calendars**: you land back in Kamkazi. In **Settings → Calendar → Google Calendar**, tick the calendars you want to sync (your primary is pre-selected) and press **Save selection**. Events appear in the Calendar view within a minute, and refresh automatically every 15 minutes.

10. **Done** — events from Google show up read-only in the Calendar. To stop, press **Disconnect** (removes the stored tokens and all synced Google events).

Troubleshooting:

- **"Google Calendar is not configured yet"** — the Client ID/Secret weren't saved. Repeat step 7.
- **"Connection needs attention" / Reconnect shown** — the token was revoked (e.g. you removed access at myaccount.google.com → Security → Third-party access). Press **Reconnect**.
- **No events appear** — make sure you ticked the right calendars in step 9 and pressed Save.