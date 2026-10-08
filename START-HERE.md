# Saathi — complete setup, start to finish
Developed by Devnale Globals

Overview of the order (important):
1. Website + server on Render first  ->  you get your URL
2. Put that URL in the app, build the APK
3. Put the APK on the website  ->  users sign up on the web and download the app from there

-------------------------------------------------------------------------------
## 0. One-time installs and accounts
- Node.js LTS: https://nodejs.org  (check: `node -v`)
- Git: https://git-scm.com  (check: `git -v`)
- Accounts (free): github.com, render.com (sign in with GitHub), expo.dev

PowerShell, only if you get "running scripts is disabled":
    Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

-------------------------------------------------------------------------------
## 1. Upload the project to GitHub
Create an EMPTY repo on github.com named `saathi` (no README). Then:

    cd C:\Users\Rushikesh\Downloads\saathi
    git init
    git add .
    git commit -m "Saathi by Devnale Globals"
    git branch -M main
    git remote add origin https://github.com/YOUR-USERNAME/saathi.git
    git push -u origin main

(If git asks "who are you": run
 git config --global user.name "Your Name"
 git config --global user.email "you@example.com"  and commit again.)

-------------------------------------------------------------------------------
## 2. Host on Render
1. dashboard.render.com -> New -> Blueprint -> select the `saathi` repo -> Apply
2. Wait until the `saathi` service shows "Live" (~5 min)
3. Copy your URL, e.g. https://saathi-abcd.onrender.com
4. Check: open https://saathi-abcd.onrender.com/api/health  -> {"ok":true,...}
5. Open https://saathi-abcd.onrender.com and create a test account
   (test mode: the OTP code appears on screen)

-------------------------------------------------------------------------------
## 3. Build the Android app
Edit mobile\app.json -> set your Render URL:
    "apiUrl": "https://saathi-abcd.onrender.com",

Optional now (map shows blank without it): Google Maps key
    console.cloud.google.com -> new project -> enable "Maps SDK for Android"
    -> Credentials -> Create API key -> paste into app.json "googleMaps": { "apiKey": "..." }

Commands:
    cd C:\Users\Rushikesh\Downloads\saathi\mobile
    npm install
    npx expo install --fix
    npm install -g eas-cli
    (close and reopen PowerShell, cd back into the mobile folder)
    eas login                      -> log in through the browser
    eas init                       -> "Create a project?" Y
    eas build -p android --profile preview
                                   -> "Generate a new Android Keystore?" Y
Wait 15-20 min. Open the link shown and download the .apk.

If `eas` is "not recognized": use `npx eas-cli login`, `npx eas-cli init`,
`npx eas-cli build -p android --profile preview` instead.

Notes:
- The yellow "npm warn deprecated" lines and "vulnerabilities" are normal. Do NOT run `npm audit fix --force`.
- After `eas init`, app.json contains a real projectId. Commit it.

-------------------------------------------------------------------------------
## 4. Put the app on your website
1. Rename the downloaded file to   saathi.apk
2. Move it to                      saathi\web\downloads\saathi.apk
3. Push:
       cd C:\Users\Rushikesh\Downloads\saathi
       git add .
       git commit -m "Add Android app"
       git push
4. Render redeploys automatically (~3 min).
5. Test: https://saathi-abcd.onrender.com/download

-------------------------------------------------------------------------------
## 5. What users do
1. Open your website, create a profile
2. Tap "Get the app" (card at the top after signup / header button)
3. Install the APK -> allow "Install unknown apps"
4. Sign in with the same mobile + password
5. Location -> "Allow all the time"; Battery -> "Unrestricted"

-------------------------------------------------------------------------------
## 6. Updating later
- Website/server change: edit code -> git add . -> git commit -m "..." -> git push
- App change: build again (step 3), replace web\downloads\saathi.apk,
  bump APP_VERSION in Render -> Environment, then git push

-------------------------------------------------------------------------------
## 7. Before real users
- Render: upgrade web service + database from free (free DB is deleted after 30 days, server sleeps)
- Render -> Environment: OTP_DEV_MODE=false, SMS_PROVIDER=msg91, MSG91_AUTH_KEY, MSG91_TEMPLATE_ID
- Push notifications when the app is closed: Firebase google-services.json (see README)
- Privacy policy page + account deletion (DPDP Act)
