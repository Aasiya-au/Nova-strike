# Supabase setup for Nova Strike

Everything below is done in the Supabase dashboard for your project. Run the SQL files **in order**.

## 1. SQL (SQL Editor, then New query, paste, Run)

| Step | File | What it does |
|---|---|---|
| optional | `00_inspect.sql` | Read-only. Shows your current tables, columns, RLS status, policies and functions. Run its queries one at a time. |
| 1 | `01_schema.sql` | Creates or updates tables without duplicating anything. Moves the old `highest_level_unlocked` column into `level_progress` and drops it (the data is copied first). Supabase may show a "destructive operation" warning; that is this step. Click **Run this query**. |
| 2 | `02_functions.sql` | Signup trigger, `submit_run` (the only way game data is written) and `get_leaderboard`. |
| 3 | `03_rls.sql` | Turns on Row Level Security for every table, removes old policies and adds the new ones. Click **Run this query** on the warning. |
| 4 | `04_test_rls.sql` | Two-account security test. Expect an "error" starting `RLS TEST REPORT`; every line should say PASS. Nothing is saved. |
| optional | `99_optional_cleanup.sql` | Only if you ran the earlier version of the game that saved failed runs. Deletes them and recomputes stats. |

All scripts are safe to run again.

## 2. Auth settings (Authentication in the sidebar)

1. **Sign In / Providers, then Email**: keep Email enabled.
   - **Confirm email**: turn ON for a real launch (players must click a link before logging in). Turn it OFF while you are testing, because the built-in email service only sends a few emails per hour.
   - **Minimum password length**: set to 8.
2. **URL Configuration** (needed for confirmation and reset links to come back to your site):
   - **Site URL**: `http://localhost:8000` while testing, your Netlify URL (for example `https://your-site.netlify.app`) for the live site.
   - **Redirect URLs**: add `http://localhost:8000/**` and `https://your-site.netlify.app/**`.
3. If you send more than a few emails an hour (confirmations and password resets), add your own mail provider under **Project Settings, then Authentication, then SMTP Settings**. The built-in sender is only meant for testing.
4. Passwords are hashed and checked by Supabase Auth. No password column exists in any table you own.

## 3. Keys

`js/config.js` takes the project URL and the **publishable** key (or the legacy `anon` key). Never put the **secret** or `service_role` key in any file in this project.

## 4. Verify

- **Table Editor**: every table shows RLS enabled. **Database, then Policies**: each table lists only the "read own" or "read" policies from `03_rls.sql`.
- Run `04_test_rls.sql` (above).
- Run the live test in your browser (needs two real accounts): serve the project, open `http://localhost:8000/tests/rls-test.html`, sign in as two different test accounts and run it. Delete the `tests` folder before you publish the site if you do not want it online.
